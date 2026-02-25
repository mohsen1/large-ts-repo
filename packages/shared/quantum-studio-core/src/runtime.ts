import {
  chunkAsync,
  filterAsync,
  mapAsync,
  type AsyncLikeIterable,
} from '@shared/typed-orchestration-core';
import { QuantumPluginRegistry, validateRegistry } from './registry';
import { fixturePlan, baselineFixtures } from './fixtures';
import {
  isValidSeed,
  namespaceId,
  type QuantumRunResult,
  runId,
  scenarioId,
  tenantId,
  type QuantumSignalState,
  type ScenarioSeed,
  type RunArtifact,
} from './domain';
import type { PluginDefinition, PluginName } from './plugins';

export type EngineMode = 'dry-run' | 'live';

export type RunEnvelope<TOutput> = {
  readonly runId: string;
  readonly mode: EngineMode;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly output: Readonly<TOutput>;
};

export type RuntimeTrace = {
  readonly step: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly phase: `phase:${string}`;
  readonly elapsedMs: number;
};

export type RuntimeSummary<TOutput> = {
  readonly runId: string;
  readonly seed: ScenarioSeed;
  readonly mode: EngineMode;
  readonly traces: readonly RuntimeTrace[];
  readonly results: Readonly<RunEnvelope<TOutput>>;
};

export type EngineResult<TOutput> = {
  readonly run: QuantumRunResult<TOutput>;
  readonly summary: RuntimeSummary<TOutput>;
  readonly signalState: QuantumSignalState;
};

const formatTimeline = (value: Date): string => value.toISOString();

const asResult = <T>(value: T): Readonly<T> => value;

const baselineContext = () => ({
  mode: 'dry-run' as EngineMode,
  tenant: tenantId('baseline-tenant'),
  scenarioId: scenarioId('baseline-recovery'),
  startedAt: new Date().toISOString(),
});

const normalizeMode = (value: string): EngineMode => (value === 'live' ? 'live' : 'dry-run');

const withFallbackSeed = (seed: ScenarioSeed): ScenarioSeed => {
  if (isValidSeed(seed)) {
    return seed;
  }
  return {
    tenant: tenantId('fallback-tenant'),
    scenarioId: scenarioId('fallback-scenario'),
    profile: {
      namespace: namespaceId('recovery'),
      tenant: tenantId('fallback-tenant'),
      scenarioId: scenarioId('fallback-scenario'),
      scenarioName: 'fallback',
      graph: {
        nodes: [],
        edges: [],
      },
      metadata: {},
      seedSignals: [],
    },
    selectedPlugins: ['plugin:recovery/source'],
    requestedMode: 'discovery',
  };
};

const toArtifacts = (traces: readonly RuntimeTrace[]): readonly RunArtifact[] =>
  traces.map((entry) => ({
    artifactType: 'runtime-trace',
    payload: {
      step: entry.step,
      phase: entry.phase,
      elapsedMs: entry.elapsedMs,
    },
    generatedAt: entry.endedAt,
  }));

const collectSummaryOutput = <TOutput>(seed: ScenarioSeed, mode: EngineMode, traces: readonly RuntimeTrace[]): RunEnvelope<TOutput> => {
  const durationMs = traces.reduce((acc, current) => acc + current.elapsedMs, 0);
  const final = traces.at(-1);
  return {
    runId: `summary:${seed.scenarioId}`,
    mode,
    startedAt: final?.startedAt ?? formatTimeline(new Date()),
    durationMs,
    output: asResult({
      mode,
      scenario: seed,
      latestStep: final?.step ?? 'none',
      traceCount: traces.length,
    } as TOutput),
  };
};

export const runWithPlugins = async <TOutput>(
  plugins: readonly PluginDefinition<any, any, any, any>[],
  seed: ScenarioSeed,
  mode: EngineMode,
): Promise<EngineResult<TOutput>> => {
  const registry = validateRegistry(plugins);
  const resolvedSeed = withFallbackSeed(seed);
  const start = Date.now();
  const baseline = baselineContext();

  const ordered = registry.names();
  const pluginStream = mapAsync(
    ordered,
    async (pluginName, index): Promise<RuntimeTrace> => {
      const started = new Date();

      await registry.run(
        pluginName as PluginName,
        {
        seed: resolvedSeed,
        scenarioName: resolvedSeed.profile.scenarioName,
        },
        {
        tenant: resolvedSeed.tenant,
        node: `node:${resolvedSeed.scenarioId}-${index}`,
        },
      );

      const ended = new Date();
      return {
        step: pluginName,
        startedAt: formatTimeline(started),
        endedAt: formatTimeline(ended),
        phase: `phase:${pluginName}`,
        elapsedMs: Math.max(0, ended.getTime() - started.getTime()),
      };
    },
  );

  const filtered = filterAsync(pluginStream, ({ phase }) => phase.length > 0);
  const chunks = chunkAsync(filtered, 2);
  const traces: RuntimeTrace[] = [];

  for await (const chunk of chunks) {
    traces.push(...chunk);
  }

  const summaryOutput = collectSummaryOutput<TOutput>(resolvedSeed, mode, traces);
  const summary: RuntimeSummary<TOutput> = {
    runId: baseline.scenarioId,
    seed: resolvedSeed,
    mode: normalizeMode(mode),
    traces,
    results: summaryOutput,
  };

  const result: QuantumRunResult<TOutput> = {
    runId: runId(`${resolvedSeed.scenarioId}-${start}`),
    scenarioId: resolvedSeed.scenarioId,
    status: traces.length > 0 ? 'ok' : 'warn',
    producedAt: formatTimeline(new Date()),
    tenant: resolvedSeed.tenant,
    output: asResult(traces.at(-1) ? traces.at(-1)!.step : 'idle') as TOutput,
    artifacts: toArtifacts(traces),
    traces: traces.map((entry) => `${entry.step}:${entry.elapsedMs}`),
  };

  return {
    run: result,
    summary,
    signalState: traces.length ? 'active' : 'pending',
  };
};

export const runBaselinePlan = async <TOutput>(mode: EngineMode = 'dry-run'): Promise<EngineResult<TOutput>> => {
  const plans = await fixturePlan();
  const plan = plans.at(0);
  if (!plan) {
    throw new Error('No baseline seed available');
  }
  return runWithPlugins<TOutput>(
    baselineFixtures.defaults as readonly PluginDefinition<any, any, any, any>[],
    plan,
    mode,
  );
};

export async function* planTimeline<TOutput>(
  seeds: readonly ScenarioSeed[],
): AsyncGenerator<EngineResult<TOutput>, void, void> {
  for await (const seed of seeds) {
    const result = await runBaselinePlan<TOutput>(normalizeMode('dry-run'));
    yield {
      ...result,
      summary: {
        ...result.summary,
        seed,
      },
    };
  }
}

export const collectTimeline = async <TOutput>(
  seeds: AsyncLikeIterable<ScenarioSeed>,
): Promise<readonly EngineResult<TOutput>[]> => {
  const out: EngineResult<TOutput>[] = [];
  for await (const seed of seeds) {
    out.push(await runWithPlugins<TOutput>(baselineFixtures.defaults as readonly PluginDefinition<any, any, any, any>[], seed, 'dry-run'));
  }
  return out;
};

export const runtimeDefaults = () => {
  const baseline = baselineContext();
  return {
    startedAt: baseline.startedAt,
    tenant: baseline.tenant,
    scenarioId: baseline.scenarioId,
    mode: baseline.mode,
  } as const;
};
