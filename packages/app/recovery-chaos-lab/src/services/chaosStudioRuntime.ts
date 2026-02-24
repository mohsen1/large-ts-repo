import { fail, ok, type Result } from '@shared/result';
import {
  asNamespace,
  asScenarioId,
  buildChaosPlan,
  buildForecastCurve,
  buildRuntimeFromForecast,
  validatePlan,
  type ChaosNamespace,
  type ChaosScenarioDefinition,
  type ChaosStatus,
  type StageBoundary
} from '@domain/recovery-chaos-lab';
import { createRuntimeRegistryProfile } from './chaosSignalBus';
import {
  buildBucketReport,
  pickLatestRows,
  withRunStore,
  type QueryCursor
} from '@data/recovery-chaos-observability';
import {
  streamChaosScenario,
  summarizeEvents,
  type ChaosRunEvent,
  type ChaosRunReport,
  type ChaosSchedulerOptions,
  type RunContext,
  type PluginAdapter,
  type RegistryLike
} from '@service/recovery-chaos-orchestrator';

export interface ChaosStudioSessionConfig {
  readonly namespace: string;
  readonly scenarioId: string;
  readonly options?: ChaosSchedulerOptions;
}

export interface ChaosStudioSession {
  readonly config: ChaosStudioSessionConfig;
  readonly planId: string;
  readonly status: ChaosStatus;
  readonly forecast: ReturnType<typeof buildRuntimeFromForecast>;
  readonly events: readonly ChaosRunEvent[];
  readonly report: ChaosRunReport<readonly StageBoundary<string, unknown, unknown>[]>;
  readonly insights: ReturnType<typeof buildBucketReport>;
}

export interface StudioRuntimeScope {
  readonly namespace: string;
  readonly scenarioId: string;
  readonly catalogDigest: readonly string[];
  readonly startedAt: number;
}

interface StudioRegistryFactory {
  readonly stage: string;
  readonly execute: (input: unknown, context?: unknown) => Promise<unknown>;
}

type RegistryFactoryStage<TStages extends readonly StageBoundary<string, unknown, unknown>[]> = {
  readonly stage: TStages[number]['name'];
  readonly execute: (input: unknown, context: RunContext) => Promise<unknown>;
};

const rawTemplates: readonly {
  readonly namespace: ChaosNamespace;
  readonly scenarioId: string;
}[] = [
  { namespace: 'platform-chaos' as ChaosNamespace, scenarioId: '9f6de4d6-9cb0-4a9c-95d2-ef12f7c5fbf8' },
  { namespace: 'compute-chaos' as ChaosNamespace, scenarioId: '2b3c7a11-5bf1-4f2f-b4a9-3e4f9f7b6ed3' }
] as const;

export const CHAOS_STUDIO_CATALOG: readonly string[] = rawTemplates.map((entry) => `${entry.namespace}/${entry.scenarioId}`);

export function loadStudioScope(): StudioRuntimeScope {
  return {
    namespace: rawTemplates[0].namespace,
    scenarioId: rawTemplates[0].scenarioId,
    catalogDigest: CHAOS_STUDIO_CATALOG,
    startedAt: Date.now()
  };
}

export function buildStudioProfile<TStages extends readonly StageBoundary<string, unknown, unknown>[]>(
  scenario: ChaosScenarioDefinition & { stages: TStages }
) {
  const plan = buildChaosPlan(
    {
      namespace: scenario.namespace,
      scenarioId: scenario.id,
      stages: scenario.stages,
      tags: ['control:active', 'targeted:verified']
    },
    '30m',
    scenario.stages.map((stage) => stage.weight ?? 1)
  );
  const validation = validatePlan(scenario.stages, ['pre-s', 'mid-m', 'post-h']);
  const forecastCurve = buildForecastCurve({
    namespace: scenario.namespace,
    scenarioId: scenario.id,
    planTag: `studio-${scenario.id}`,
    horizon: validation.ok ? 'short' : 'long',
    confidence: validation.ok ? 0.82 : 0.33,
    window: '5m'
  });
  const forecast = buildRuntimeFromForecast(
    {
      namespace: scenario.namespace,
      scenarioId: scenario.id,
      planTag: `studio-${scenario.id}`,
      horizon: 'short',
      confidence: 0.75,
      window: '1m'
    },
    scenario.stages
  );
  return {
    plan,
    schedule: forecastCurve.traces.map((trace) => trace.points.length),
    forecast,
    valid: validation.ok
  };
}

function createStudioRegistry<TStages extends readonly StageBoundary<string, unknown, unknown>[]>(
  factories: readonly StudioRegistryFactory[]
): RegistryLike<TStages> {
  const lookup = new Map<string, RegistryFactoryStage<TStages>['execute']>();
  for (const factory of factories) {
    lookup.set(factory.stage, async (input) => factory.execute(input));
  }

  return {
    get<Name extends TStages[number]['name']>(name: Name) {
      const execute = lookup.get(String(name));
      if (!execute) {
        return undefined;
      }
      type StageFor<Name extends TStages[number]['name']> = Extract<TStages[number], { name: Name }>;
      return {
        plugin: String(name) as StageFor<Name>['name'],
        execute: async (input, context: RunContext) => {
          const profile = createRuntimeRegistryProfile(
            input,
            String(context.namespace),
            String(context.scenarioId),
            String(context.runId)
          );
          if (!profile.ok) {
            return profile;
          }
          const output = await execute(input, context);
          return ok(output as StageFor<Name>['output']);
        }
      } as PluginAdapter<StageFor<Name>>;
    }
  };
}

function toRuntimeEvents(
  streamEvents: readonly ChaosRunEvent[],
  envelope: ChaosRunReport<readonly StageBoundary<string, unknown, unknown>[]>
): readonly ChaosRunEvent[] {
  if (streamEvents.length > 0) {
    return streamEvents;
  }
  return [
    envelope.status === 'failed'
      ? {
          runId: envelope.runId,
          at: envelope.finalAt,
          kind: 'run-failed',
          status: 'failed',
          snapshot: envelope.snapshot
        }
      : {
          runId: envelope.runId,
          at: envelope.finalAt,
          kind: 'run-complete',
          status: 'complete',
          snapshot: envelope.snapshot
        }
  ];
}

function normalizeCursor(config: ChaosStudioSessionConfig): QueryCursor {
  return {
    namespace: config.namespace,
    scenarioId: config.scenarioId,
    state: 'active',
    offset: 0
  };
}

export async function startStudioSession<
  TStages extends readonly StageBoundary<string, unknown, unknown>[],
  TFactories extends readonly StudioRegistryFactory[]
>(
  config: ChaosStudioSessionConfig,
  scenario: ChaosScenarioDefinition & { stages: TStages },
  factories: TFactories,
  options: ChaosSchedulerOptions = {}
): Promise<Result<ChaosStudioSession>> {
  const registry = createStudioRegistry<TStages>(factories);
  const profile = buildStudioProfile(scenario);
  const stream = await streamChaosScenario(config.namespace, scenario as never, registry, options);
  const events = toRuntimeEvents(stream.events, stream.report);
  const summary = summarizeEvents(events);
  const summaryProgress = summary.attempts > 0 ? summary.failures / summary.attempts : 0;

  const stored = await withRunStore<TStages, ChaosStudioSession>(
    config.namespace,
    config.scenarioId,
    async (repo) => {
      const upserted = await repo.upsert({
        namespace: asNamespace(config.namespace),
        scenarioId: asScenarioId(config.scenarioId),
        runId: stream.report.runId,
        snapshot: stream.report.snapshot,
        status: stream.report.status,
        progress: stream.report.progress,
        stages: scenario.stages,
        statusByStage: Object.fromEntries(
          stream.report.trace.map((entry) => [entry.stage, stream.report.status] as const)
        ) as Record<TStages[number]['name'], ChaosStatus>,
        metrics: {
          metricKey: `studio:${config.namespace}:${config.scenarioId}` as never,
          samples: []
        },
        state: 'active'
      });
      if (!upserted.ok) {
        throw upserted.error;
      }

      const listed = repo.list({
        namespace: asNamespace(config.namespace),
        scenarioId: asScenarioId(config.scenarioId)
      });
      if (!listed.ok) {
        throw listed.error;
      }
      const selected = pickLatestRows(listed.value, 25);
      const insights = buildBucketReport(config.namespace, config.scenarioId, selected);
      void summaryProgress;
      void normalizeCursor(config);
      return {
        config,
        planId: `${config.namespace}:${config.scenarioId}:studio-v1`,
        status: stream.report.status,
        forecast: profile.forecast,
        events,
        report: stream.report,
        insights
      };
    }
  );

  if (!stored.ok) {
    return fail(stored.error);
  }
  return ok(stored.value);
}
