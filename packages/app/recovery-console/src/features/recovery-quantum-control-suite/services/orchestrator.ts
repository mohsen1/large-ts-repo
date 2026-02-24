import {
  OrchestrationEngine,
  type EngineExecutionContext,
  type EngineRunResult,
  type EngineOptions,
} from '@shared/orchestration-runtime/strategy-engine';
import { EventBus, type EventEnvelope } from '@shared/typed-orchestration-core/runtime-events';
import { composeAdapters, type AdapterOutput, type AdapterStep } from '@shared/orchestration-runtime/adapter';
import { asBrand } from '@shared/typed-orchestration-core/brands';
import { buildPlugins, makePluginContext, type PluginBundle } from './plugin-pipeline';
import { EventBus as RuntimeBus } from '@shared/typed-orchestration-core/runtime-events';
import { runtimeManifest } from '@shared/orchestration-runtime/manifest';
import type { PluginPayload, QuantumInput, QuantumOutput, QuantumRunId, QuantumSessionId, QuantumTenantId } from '../types';
import { makeStage } from '../types';
import { asTuple } from '@shared/typed-orchestration-core/tuple-utils';

export type QuantumRunConfig = {
  readonly tenant?: QuantumTenantId;
  readonly includeMetrics?: boolean;
  readonly options?: EngineOptions;
  readonly includeAdapters?: boolean;
  readonly includeTelemetry?: boolean;
};

export interface QuantumOrchestrationOutcome {
  readonly run: EngineRunResult<QuantumOutput>;
  readonly bundle: PluginBundle<QuantumInput, QuantumOutput>;
  readonly diagnostics: readonly {
    readonly event: string;
    readonly severity: string;
    readonly payload: unknown;
  }[];
}

const buildDummyAdapterPipeline = (): readonly AdapterStep<PluginPayload, PluginPayload>[] => [
  {
    id: asBrand('adapter:validation', 'AdapterId'),
    label: 'validation',
    run: async (input: PluginPayload) => ({
      accepted: true,
      payload: input,
      message: 'validated',
    }),
  },
  {
    id: asBrand('adapter:transform', 'AdapterId'),
    label: 'transform',
    run: async (input: PluginPayload) => ({
      accepted: true,
      payload: {
        ...input,
        markers: [...input.markers, { stamp: new Date().toISOString(), phase: 'transform', value: 'ok', weight: 1 }],
      },
      message: 'transformed',
    }),
  },
] as const;

const toDiagnostics = (runtimeBus: EventBus<Record<string, EventEnvelope<unknown>>>, include: boolean) => {
  if (!include) {
    return [] as const;
  }
  return [...runtimeBus.stream()].map((entry) => ({
    event: entry.event,
    severity: entry.severity,
    payload: entry.payload,
  }));
};

const evaluateBundle = async (tenant: QuantumTenantId, input: QuantumInput): Promise<QuantumOutput> => {
  const runId = asBrand(`run-${Date.now()}`, 'RunId') as QuantumRunId;
  const pluginPayload: PluginPayload = {
    output: {
      runId,
      executedAt: new Date().toISOString(),
      summary: `summary:${tenant}`,
      stages: [
        {
          stage: makeStage('evaluate'),
          stageRunId: runId,
          directives: [
            {
              id: `directive:${runId}:bootstrap`,
              command: 'synchronize',
              reason: 'initial orchestration',
              priority: 1,
              dependencies: [],
            },
          ],
          artifactPayload: {
            eventCount: input.signals.values.length,
            event: input.stage,
          },
        },
      ],
      directives: [
        {
          id: `directive:${runId}:seed`,
          command: 'synchronize',
          reason: 'seeded',
          priority: 1,
          dependencies: [],
        },
      ],
      status: 'ok',
    },
    input,
    markers: [
      {
        stamp: new Date().toISOString(),
        phase: 'bootstrap',
        value: tenant,
        weight: 1,
      },
    ],
  };

  const adapterResult = await composeAdapters(buildDummyAdapterPipeline(), pluginPayload);
  if (!adapterResult.accepted) {
    return {
      ...pluginPayload.output,
      status: 'error',
      directives: [
        ...pluginPayload.output.directives,
        {
          id: `directive:${runId}:adapter`,
          command: 'freeze',
          reason: adapterResult.message,
          priority: 9,
          dependencies: ['adapter:validation'],
        },
      ],
    };
  }

  return pluginPayload.output;
};

export const runQuantumSuite = async (
  tenant: QuantumTenantId,
  payload: QuantumInput,
  config: QuantumRunConfig = {},
): Promise<QuantumOrchestrationOutcome> => {
  const runId = asBrand(`run-${Date.now()}`, 'RunId');
  const sessionId = asBrand(`session-${runId}`, 'SessionId') as QuantumSessionId;
  const effectiveTenant = config.tenant ?? tenant;
  const context: EngineExecutionContext<QuantumInput> = {
    runId,
    tenant: effectiveTenant,
    startedAt: new Date().toISOString(),
    input: payload,
  };

  const plugins = buildPlugins();
  const bundle: PluginBundle<QuantumInput, QuantumOutput> = {
    sessionId,
    runId,
    tenant: effectiveTenant,
    plugins,
  };

  const runtimeBus = new EventBus<Record<string, EventEnvelope<unknown>>>();
  const contextPayload = makePluginContext(runId, effectiveTenant);
  if (!contextPayload.input.signals.values.length) {
    runtimeBus.publish('runtime/seed' as const, {
      id: `seed-${runId}`,
      payload: contextPayload.input,
      channel: 'channel:runtime',
      kind: 'kind:seed',
      event: 'runtime/seed',
      severity: 'low',
      timestamp: new Date().toISOString(),
    });
  }

  const manifestSize = runtimeManifest.plugins.length;
  const labels = asTuple(['seed', 'run', 'complete']);
  const eventTags = labels.join('-');
  const runtimeSnapshot = toDiagnostics(runtimeBus, true);

  const run = await engineExecute(
    runId,
    effectiveTenant,
    payload,
    config.options,
    context,
    { ...plugins },
    eventTags,
    manifestSize,
  );

  const pluginOutput = config.includeAdapters
    ? await evaluateBundle(effectiveTenant, payload)
    : run.output;

  return {
    run: {
      ...run,
      output: pluginOutput,
    },
    bundle,
    diagnostics: [
      ...runtimeSnapshot,
      ...config.includeMetrics ? [ { event: 'metrics:seed', severity: 'low', payload: { eventTags, manifestSize } } ] : [],
    ],
  };
};

const engineExecute = async (
  runId: QuantumRunId,
  tenant: QuantumTenantId,
  payload: QuantumInput,
  options: EngineOptions | undefined,
  context: EngineExecutionContext<QuantumInput>,
  _registry: PluginBundle<QuantumInput, QuantumOutput>['plugins'],
  eventTags: string,
  manifestSize: number,
): Promise<EngineRunResult<QuantumOutput>> => {
  const plugins = buildPlugins();
  const engine = new OrchestrationEngine<QuantumInput, QuantumOutput>(plugins, options);
  const execution = await engine.run(payload, tenant);

  void context;

  return {
    id: runId,
    tenant,
    stageCount: execution.stageCount + manifestSize,
    durationMs: execution.durationMs,
    startedAt: execution.startedAt,
    output: {
      ...execution.output,
      runId,
      executedAt: new Date().toISOString(),
      summary: `summary:${eventTags}`,
      stages: [
        {
          stage: makeStage('runtime'),
          stageRunId: runId,
          directives: [
            {
              id: `directive:${runId}:engine`,
              command: 'synchronize',
              reason: `tags:${eventTags}`,
              priority: 2,
              dependencies: ['runtime/engine'],
            },
          ],
          artifactPayload: {
            events: execution.stageCount,
            manifestSize,
          },
        },
      ],
      directives: execution.output?.directives ?? [],
      status: execution.output?.status ?? 'warn',
    },
  };
};

export const validateAdapterOutputs = (results: readonly AdapterOutput<PluginPayload>[]) =>
  results.every((output) => output.accepted && output.payload.output.status !== 'error');

export const runtimeBusProbe = (bus: RuntimeBus<Record<string, EventEnvelope<unknown>>>) => {
  const values = [...bus.stream()];
  return values.length > 0 ? values.map((entry) => entry.event) : ['no-events'];
};
