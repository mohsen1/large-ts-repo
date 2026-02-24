import {
  buildPluginDefinition,
  canonicalizeNamespace,
  buildPluginVersion,
  type CompatibleChain,
  type PluginContext,
  type PluginDefinition,
  type PluginDependency,
  type PluginKind,
  type PluginResult,
} from '@shared/stress-lab-runtime';
import {
  makeTemporalWindow,
  type MeshLane,
  type MeshMode,
  type TenantId,
  type SignalId,
} from '@shared/orchestration-lab-core';
import { z } from 'zod';
import {
  buildDependencyGraph,
  createMeshOrchestrator,
  runMeshOrchestrator,
  type MeshRunSeed,
  type MeshRuntimeResult,
  type MeshRuntimeRunner,
} from '@shared/orchestration-lab-core';

export interface MeshSignal {
  readonly id: string;
  readonly severity: 'critical' | 'high' | 'moderate' | 'low';
  readonly value: number;
}

export interface MeshScenarioPlan {
  readonly scenarioId: string;
  readonly lanes: readonly MeshLane[];
  readonly mode: MeshMode;
  readonly constraintBudget: number;
  readonly manifestDigest: string;
}

export interface MeshScenarioResult {
  readonly runId: string;
  readonly ok: boolean;
  readonly score: number;
  readonly confidence: number;
  readonly traces: readonly string[];
  readonly dependencies: {
    readonly namespace: string;
    readonly order: readonly string[];
  };
  readonly runtime: {
    readonly checksum: string;
    readonly latencyMs: number;
    readonly sortedDurations: readonly number[];
  };
}

type PluginContextSnapshot = PluginContext<Record<string, unknown>>;
type PluginResultSnapshot<TValue> = PluginResult<TValue>;
type AnyMeshPlugin = PluginDefinition<unknown, unknown, Record<string, unknown>, PluginKind>;
type MeshKind = `stress-lab/${MeshLane}`;

const lanesForScenario = (scenarioId: string): readonly MeshLane[] => {
  if (scenarioId.includes('policy')) {
    return ['policy', 'safety', 'topology'];
  }
  if (scenarioId.includes('signal')) {
    return ['signal', 'topology', 'simulation'];
  }
  if (scenarioId.includes('sim')) {
    return ['simulation', 'policy'];
  }
  return ['signal', 'topology', 'policy', 'safety'];
};

const resolveMode = (scenarioId: string, rawMode: string): MeshMode =>
  rawMode === 'control' || rawMode === 'simulation' || rawMode === 'policy-what-if' || rawMode === 'discovery'
    ? (rawMode as MeshMode)
    : scenarioId.includes('policy')
      ? 'policy-what-if'
      : scenarioId.includes('sim')
        ? 'simulation'
        : scenarioId.includes('control')
          ? 'control'
          : 'discovery';

const buildScenarioManifest = (
  seed: string,
  lanes: readonly MeshLane[],
  mode: MeshMode,
): MeshScenarioPlan => ({
  scenarioId: seed,
  lanes,
  mode,
  constraintBudget: Number(((lanes.length * 17) / 100).toFixed(2)),
  manifestDigest: `seed:${seed}:mode:${mode}:count:${lanes.length}`,
});

const manifestToSignals = (values: readonly string[]): readonly MeshSignal[] =>
  values.toSorted().map((id) => ({
    id,
    severity: 'low',
    value: Number(id.length),
  }));

const pluginDependency = (id: string): PluginDependency => `dep:${id}` as PluginDependency;

const seedSchema = z.object({
  tenantId: z.string(),
  lane: z.string(),
  mode: z.enum(['discovery', 'control', 'simulation', 'policy-what-if']),
  selectedSignals: z.array(z.string()),
  window: z.object({
    from: z.string(),
    to: z.string(),
    timezone: z.string(),
  }),
  context: z.record(z.unknown()),
  source: z.string(),
});

const buildSeed = (
  tenantId: string,
  scenarioId: string,
  rawMode: string,
  selectedSignals: readonly string[],
) => {
  const lanes = lanesForScenario(scenarioId);
  const mode = resolveMode(scenarioId, rawMode);
  const window = makeTemporalWindow(new Date(), 5);
  const context = {
    scenarioId,
    mode,
    budget: Number(((lanes.length * 17) / 100).toFixed(2)),
    manifestDigest: `seed:${scenarioId}:mode:${mode}:count:${lanes.length}`,
  };

  const parsed = seedSchema.parse({
    tenantId,
    lane: lanes[0] ?? 'signal',
    mode,
    selectedSignals: selectedSignals.filter((entry) => entry.trim().length > 0),
    window,
    context,
    source: 'cockpit-ui',
  });

  return {
    tenantId: parsed.tenantId as TenantId,
    lane: parsed.lane as MeshLane,
    mode: parsed.mode as MeshMode,
    selectedSignals: parsed.selectedSignals.map((value) => value as unknown as SignalId),
    window: parsed.window,
    context: parsed.context as Record<string, unknown>,
    source: parsed.source,
  };
};

const pluginKindForLane = (lane: MeshLane): MeshKind => `stress-lab/${lane}`;

const makeMeshPlugin = <
  const TInput extends { readonly traceId: string },
  const TOutput extends Record<string, unknown>,
>(
  name: string,
  lane: MeshLane,
  dependencies: readonly PluginDependency[],
  run: (payload: TInput) => Promise<TOutput>,
): AnyMeshPlugin => {
  const namespace = canonicalizeNamespace(`recovery:cockpit:mesh:${lane}`);
  const kind = pluginKindForLane(lane);
  return buildPluginDefinition(namespace, kind, {
    name,
    version: buildPluginVersion(1, 0, 0),
    tags: [lane, name],
    dependencies,
    pluginConfig: {
      lane,
      signature: name,
      seed: Date.now(),
    } as Record<string, unknown>,
    run: async (_context: PluginContextSnapshot, rawInput: unknown): Promise<PluginResultSnapshot<unknown>> => {
      const input = rawInput as TInput;
      const value = await run(input);
      return {
        ok: true,
        value,
        generatedAt: new Date().toISOString(),
      };
    },
  }) as AnyMeshPlugin;
};

const buildDemoPlugins = (manifest: MeshScenarioPlan): readonly AnyMeshPlugin[] => {
  const parseLane = manifest.lanes[0] ?? 'signal';
  const enrichLane = manifest.lanes[1] ?? 'topology';
  const outputLane = manifest.lanes[2] ?? 'policy';

  const parse = makeMeshPlugin<
    { readonly traceId: string },
    { readonly traceId: string; readonly value: number; readonly normalized: number; readonly stage: 'parse' }
  >(
    `${manifest.scenarioId}-parse`,
    parseLane,
    [],
    async ({ traceId }) => ({
      traceId,
      value: 1,
      normalized: 1,
      stage: 'parse' as const,
    }),
  );

  const enrich = makeMeshPlugin<
    { readonly traceId: string; readonly value: number; readonly normalized: number },
    { readonly traceId: string; readonly value: number; readonly mode: MeshMode; readonly lanes: number; readonly ranking: string; readonly stage: 'enrich' }
  >(
    `${manifest.scenarioId}-enrich`,
    enrichLane,
    [pluginDependency(parse.id)],
    async ({ traceId, value, normalized }) => ({
      traceId,
      value: value + normalized,
      stage: 'enrich' as const,
      mode: manifest.mode,
      lanes: manifest.lanes.length,
      ranking: manifest.lanes.join(','),
    }),
  );

  const output = makeMeshPlugin<
    { readonly traceId: string; readonly value: number; readonly mode: MeshMode; readonly lanes: number; readonly ranking: string },
    { readonly traceId: string; readonly value: number; readonly mode: MeshMode; readonly lanes: number; readonly ranking: string; readonly confidence: number; readonly stage: 'output' }
  >(
    `${manifest.scenarioId}-output`,
    outputLane,
    [pluginDependency(enrich.id)],
    async ({ traceId, value, mode, lanes, ranking }) => ({
      traceId,
      value,
      mode,
      lanes,
      ranking,
      confidence: Math.min(1, Math.max(0, (value + lanes) / 100)),
      stage: 'output' as const,
    }),
  );

  return [parse, enrich, output];
};

const toSignalCatalog = (values: readonly MeshSignal[]): string =>
  values
    .toSorted((left, right) => left.id.localeCompare(right.id))
    .map((entry) => `${entry.id}:${entry.severity}:${entry.value}`)
    .join('|');

export const runRecoveryCockpitScenario = async (
  tenantId: string,
  scenarioId: string,
  rawMode: string,
  selectedSignals: readonly string[],
): Promise<MeshScenarioResult> => {
  const seed = buildSeed(tenantId, scenarioId, rawMode, selectedSignals);
  const manifest = buildScenarioManifest(scenarioId, lanesForScenario(scenarioId), seed.mode);
  const plugins = buildDemoPlugins(manifest);
  const chain = plugins as CompatibleChain<typeof plugins> & readonly PluginDefinition[];
  const graph = buildDependencyGraph(plugins);
  const runPayload = {
    traceId: `${tenantId}::${scenarioId}`,
    score: manifest.constraintBudget,
    scenario: scenarioId,
    normalizedCatalog: toSignalCatalog(manifestToSignals(seed.selectedSignals)),
  } as const;

  const runResult: MeshRuntimeResult = await runMeshOrchestrator(seed.lane, seed.mode, seed, chain, runPayload);
  const orchestrator: MeshRuntimeRunner = createMeshOrchestrator(seed.lane, seed.mode);
  const orchestratorResult = await orchestrator.run(seed, chain, runPayload);

  return {
    runId: runResult.trace.runId,
    ok: runResult.ok && orchestratorResult.ok,
    score: runResult.trace.score,
    confidence: runResult.trace.confidence,
    traces: [
      ...new Set([
        `manifest:${manifest.manifestDigest}`,
        ...runResult.trace.telemetry.events.map((entry) => `${entry.kind}=${entry.value}`),
        ...orchestratorResult.trace.telemetry.events.map((entry) => `${entry.kind}=${entry.value}`),
      ]),
    ],
    dependencies: {
      namespace: graph.namespace,
      order: graph.nodes,
    },
    runtime: {
      checksum: runResult.telemetry.checksum,
      latencyMs: runResult.telemetry.timing.avg,
      sortedDurations: orchestratorResult.telemetry.steps.map((step) => Math.abs(step.finishedAt.localeCompare(step.startedAt))),
    },
  };
};

const compatibilityScenarios = (tenantId: string): readonly string[] =>
  [`control-lane`, `${tenantId}-policy-audit`, `${tenantId}-signal-scan`, `${tenantId}-sim-shape`].map((entry) => entry);

export const runCompatibilityCheck = async (tenantId: string): Promise<readonly MeshScenarioResult[]> => {
  const scenarios = compatibilityScenarios(tenantId);
  return Promise.all(
    scenarios.map((scenarioId) =>
      runRecoveryCockpitScenario(
        tenantId,
        scenarioId,
        scenarioId,
        ['a', 'b', 'c', 'd'].map((value) => `${tenantId}:${scenarioId}:${value}`),
      ),
    ),
  );
};
