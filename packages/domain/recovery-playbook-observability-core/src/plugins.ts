import {
  type NoInfer,
  type PluginName,
  Registry,
  type RegistryPlugin,
  type PluginRecord,
  type PluginStepInput,
  type PluginTrace,
  type PluginResult,
} from '@shared/type-level';
import { createAnomalyTelemetry, createMetricTelemetry, createPhaseTelemetry, createSignalTelemetry } from './telemetry';
import {
  withBrand,
  type Brand,
} from '@shared/core';
import type {
  ObservabilityScope,
  ObservabilityRunId,
  ObservabilityPlaybookId,
  ObservabilitySignalId,
  ObservabilityMetricId,
  ObservabilityMetricRecord,
  PlaybookRuntimeMetrics,
} from './identity';

export const pluginKinds = ['ingest', 'normalize', 'enrich', 'forecast', 'alert'] as const;
export type ObservabilityPluginKind = (typeof pluginKinds)[number];
export type PlaybookPluginId = Brand<string, 'plugin-id'>;
export type PluginInputEnvelope<TScope extends ObservabilityScope> = {
  readonly runId: ObservabilityRunId;
  readonly playbookId: ObservabilityPlaybookId;
  readonly scope: TScope;
  readonly createdAt: string;
};

export interface ObservabilityPluginContext {
  readonly runId: ObservabilityRunId;
  readonly playbookId: ObservabilityPlaybookId;
  readonly scope: ObservabilityScope;
  readonly traceSeed: string;
}

export interface PlaybookObservabilityPlugin<
  TName extends string,
  TInput = unknown,
  TOutput = unknown,
> extends RegistryPlugin<TName, TInput, TOutput, PluginName<TName>> {
  readonly kind: ObservabilityPluginKind;
  readonly inputScope: ObservabilityScope;
  readonly outputScope: ObservabilityScope;
  readonly requiredScopes: readonly ObservabilityScope[];
  readonly version: `${number}.${number}.${number}`;
}

export type PluginByKind<
  TPlugins extends readonly PlaybookObservabilityPlugin<string, any, any>[],
  TKind extends ObservabilityPluginKind,
> = Extract<TPlugins[number], { kind: TKind }>;

export type PluginPayload<
  TPlugins extends readonly PlaybookObservabilityPlugin<string, any, any>[],
  TKind extends ObservabilityPluginKind,
> = TPlugins[number] extends infer Candidate
  ? Candidate extends PlaybookObservabilityPlugin<string, infer TInput, any> & { kind: TKind }
    ? TInput
    : never
  : never;

export interface PluginExecutionTrace {
  readonly plugin: PlaybookPluginId;
  readonly kind: ObservabilityPluginKind;
  readonly ms: number;
  readonly scope: ObservabilityScope;
}

export interface PluginExecutionResult<TOutput> {
  readonly ok: boolean;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly output: TOutput;
  readonly trace: PluginExecutionTrace;
}

export interface PluginRegistryState {
  readonly registryHash: string;
  readonly pluginKinds: readonly ObservabilityPluginKind[];
  readonly totalPlugins: number;
  readonly supports: readonly string[];
}

type PluginOutputEnvelope<TOutput> = PluginResult<TOutput>;

const asRegistryState = <
  TPlugins extends readonly PlaybookObservabilityPlugin<string, any, any>[],
>(plugins: TPlugins): PluginRegistryState => ({
  registryHash: `playbook-observability-registry:${plugins.length}`,
  pluginKinds: [...new Set(plugins.map((plugin) => plugin.kind))] as readonly ObservabilityPluginKind[],
  totalPlugins: plugins.length,
  supports: plugins.flatMap((plugin) => plugin.requiredScopes.map((scope) => `${plugin.kind}:${scope}`)),
});

const toPluginTrace = (context: ObservabilityPluginContext, kind: string): PluginTrace => ({
  namespace: context.traceSeed,
  correlationId: withBrand(`${context.runId}:${kind}:${context.scope}`, 'plugin-correlation-id'),
  startedAt: Date.now(),
  metadata: {
    playbookId: context.playbookId,
    scope: context.scope,
  },
});

const toPluginStepInput = <TInput>(
  input: TInput,
  phase: string,
  tags: readonly string[] = ['playbook-observability-plugin'],
): PluginStepInput<TInput> => ({
  kind: phase,
  phase,
  createdAt: new Date(),
  payload: input,
  tags,
});

export class PlaybookObservabilityPluginRegistry<
  TPlugins extends readonly PlaybookObservabilityPlugin<string, any, any>[],
> {
  readonly #registry: Registry<TPlugins>;
  readonly #index = new Map<ObservabilityScope, TPlugins[number][]>();
  readonly #state: PluginRegistryState;

  constructor(plugins: NoInfer<TPlugins>) {
    this.#registry = new Registry(plugins);
    this.#state = asRegistryState(plugins);

    for (const plugin of this.#registry.getAll()) {
      for (const scope of plugin.requiredScopes) {
        const current = this.#index.get(scope) ?? [];
        current.push(plugin);
        this.#index.set(scope, current);
      }
    }
  }

  get state(): PluginRegistryState {
    return this.#state;
  }

  byKind<TKind extends ObservabilityPluginKind>(kind: NoInfer<TKind>): readonly PluginByKind<TPlugins, TKind>[] {
    return this.#registry.filterByPath(kind) as readonly PluginByKind<TPlugins, TKind>[];
  }

  byScope(scope: ObservabilityScope): readonly TPlugins[number][] {
    return [...(this.#index.get(scope) ?? [])] as readonly TPlugins[number][];
  }

  pluginRecord(): PluginRecord<TPlugins> {
    return this.#registry.asRecord();
  }

  async execute<TKind extends ObservabilityPluginKind>(
    pluginKind: NoInfer<TKind>,
    input: PluginPayload<TPlugins, TKind>,
    context: ObservabilityPluginContext,
  ): Promise<PluginExecutionResult<PluginPayload<TPlugins, TKind>>> {
    const candidates = this.byKind(pluginKind);
    const plugin = candidates[0];
    if (!plugin) {
      return {
        ok: false,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        output: input as never,
        trace: {
          plugin: withBrand(`missing:${pluginKind}`, 'plugin-id'),
          kind: pluginKind,
          ms: 0,
          scope: context.scope,
        },
      };
    }

    const trace = toPluginTrace(context, pluginKind);
    if (!plugin.canProcess(input as never, trace)) {
      return {
        ok: false,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        output: input as never,
        trace: {
          plugin: plugin.id as PlaybookPluginId,
          kind: pluginKind,
          ms: 0,
          scope: context.scope,
        },
      };
    }

    const started = performance.now();
    const startedAt = new Date().toISOString();
    const outcome = (await plugin.process(
      toPluginStepInput(input as PluginPayload<TPlugins, TKind>, pluginKind),
      trace,
    )) as PluginOutputEnvelope<PluginPayload<TPlugins, TKind>>;
    const finishedAt = new Date().toISOString();

    if (outcome.status === 'error') {
      return {
        ok: false,
        startedAt,
        finishedAt,
        output: input as never,
        trace: {
          plugin: plugin.id as PlaybookPluginId,
          kind: pluginKind,
          ms: Math.max(1, Math.round(performance.now() - started)),
          scope: context.scope,
        },
      };
    }

    return {
      ok: true,
      startedAt,
      finishedAt,
      output: (outcome.payload ?? input) as PluginPayload<TPlugins, TKind>,
      trace: {
        plugin: plugin.id as PlaybookPluginId,
        kind: pluginKind,
        ms: Math.max(1, Math.round(performance.now() - started)),
        scope: context.scope,
      },
    };
  }

  [Symbol.dispose](): void {
    this.#registry.dispose();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.#registry[Symbol.dispose]();
  }
}

export const createTracePrefix = (scope: ObservabilityScope, traceSeed: string): string => `${scope}:${traceSeed}`;

export const pluginOutputKey = (plugin: PlaybookObservabilityPlugin<string, any, any>): string =>
  `${plugin.kind}::${plugin.id}`;

const createNormalizeOutput = (input: unknown): { readonly signal: string } => ({
  signal: String(input),
});

const createMetricSeed = (seed: string, scope: ObservabilityScope): ObservabilityMetricRecord => ({
  metricId: withBrand(`${seed}:seed`, 'ObservabilityMetricId'),
  tenantId: withBrand(`${seed}:tenant`, 'ObservabilityTenantId'),
  playbookId: withBrand(`playbook:${seed}`, 'ObservabilityPlaybookId'),
  name: `${scope}:score`,
  scope,
  value: 42,
  unit: 'count',
  path: 'metric.score',
  emittedAt: new Date().toISOString(),
});

export const defaultPluginDefinitions = () =>
  [
    {
      id: withBrand('@recovery/plugin-ingest', 'plugin-id'),
      name: 'default-ingest',
      kind: 'ingest' as const,
      version: '1.0.0',
      supports: ['ingest'],
      dependsOn: [] as const,
      inputScope: 'playbook' as const,
      outputScope: 'signal' as const,
      requiredScopes: ['playbook', 'signal'] as const,
      canProcess: () => true,
      process: async ({ payload, kind }, trace) => ({
        status: 'ok' as const,
        payload: {
          signalId: withBrand(`${trace.correlationId}:signal`, 'ObservabilitySignalId'),
          phase: kind,
          sourceRunId: (payload as { runId?: ObservabilityRunId }).runId ?? trace.correlationId,
          event: createSignalTelemetry(withBrand(String(trace.correlationId), 'ObservabilityRunId'), 'playbook'),
        },
      }),
    },
    {
      id: withBrand('@recovery/plugin-normalize', 'plugin-id'),
      name: 'default-normalize',
      kind: 'normalize' as const,
      version: '1.0.0',
      supports: ['normalize'],
      dependsOn: [withBrand('@recovery/plugin-ingest', 'plugin-id')],
      inputScope: 'signal' as const,
      outputScope: 'playbook' as const,
      requiredScopes: ['signal', 'playbook'] as const,
      canProcess: () => true,
      process: async ({ payload, kind }) => ({
        status: 'ok' as const,
        payload: {
          ...createNormalizeOutput(payload),
          normalized: true,
          phase: kind,
        },
      }),
    },
    {
      id: withBrand('@recovery/plugin-enrich', 'plugin-id'),
      name: 'default-enrich',
      kind: 'enrich' as const,
      version: '1.0.0',
      supports: ['enrich'],
      dependsOn: [withBrand('@recovery/plugin-normalize', 'plugin-id')],
      inputScope: 'playbook' as const,
      outputScope: 'playbook' as const,
      requiredScopes: ['playbook', 'policy'] as const,
      canProcess: () => true,
      process: async ({ payload }, { correlationId }) => ({
        status: 'ok' as const,
        payload: {
          ...createNormalizeOutput(payload),
          trend: 'steady' as const,
          enriched: true,
          correlation: correlationId,
        },
      }),
    },
    {
      id: withBrand('@recovery/plugin-forecast', 'plugin-id'),
      name: 'default-forecast',
      kind: 'forecast' as const,
      version: '1.0.0',
      supports: ['forecast'],
      dependsOn: [withBrand('@recovery/plugin-enrich', 'plugin-id')],
      inputScope: 'playbook' as const,
      outputScope: 'platform' as const,
      requiredScopes: ['playbook', 'platform'] as const,
      canProcess: () => true,
      process: async ({ payload, kind }, trace) => {
        const metric = createMetricSeed(`${trace.correlationId}`, 'platform');
        const event = createMetricTelemetry(
          withBrand(`${trace.correlationId}`, 'ObservabilityRunId'),
          'platform',
          metric,
        );
        return {
          status: 'ok' as const,
          payload: {
            metricTrend: 'increasing' as const,
            metric,
            input: payload,
            phase: kind,
            event,
          },
        };
      },
    },
    {
      id: withBrand('@recovery/plugin-alert', 'plugin-id'),
      name: 'default-alert',
      kind: 'alert' as const,
      version: '1.0.0',
      supports: ['alert'],
      dependsOn: [withBrand('@recovery/plugin-forecast', 'plugin-id')],
      inputScope: 'incident' as const,
      outputScope: 'incident' as const,
      requiredScopes: ['incident', 'policy'] as const,
      canProcess: () => true,
      process: async ({ kind }, trace) => ({
        status: 'ok' as const,
        payload: {
          notified: true,
          phase: kind,
          annotation: createAnomalyTelemetry(
            withBrand(`${trace.correlationId}`, 'ObservabilityRunId'),
            'incident',
            {
              severity: 1,
              signal: withBrand(`${trace.correlationId}:signal`, 'ObservabilitySignalId'),
            },
          ),
        },
      }),
    },
  ] as const satisfies readonly PlaybookObservabilityPlugin<string, unknown, unknown>[];

export const createPluginTelemetry = (
  plugins: readonly PlaybookObservabilityPlugin<string, any, any>[],
): string => plugins.map((plugin) => pluginOutputKey(plugin)).join('|');
