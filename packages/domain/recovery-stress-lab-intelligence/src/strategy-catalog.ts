import { Brand, withBrand } from '@shared/core';
import {
  type CompatibleChain,
  type PluginContext,
  type PluginDefinition,
  type PluginDependency,
  type PluginId,
  createPluginContext,
  createPluginDefinitionNamespace,
  buildPluginDefinition,
  createPluginKind,
  createPluginVersion,
  executePluginChain,
} from '@shared/stress-lab-runtime';
import {
  collectTraversal,
  type WorkloadSignal,
  type WorkflowGraph,
} from '@domain/recovery-stress-lab-intelligence/flow-graph';

export type Brandify<T, B extends string> = Brand<T, B>;

export type StrategyBundleId = Brandify<string, 'RecoveryStrategyBundleId'>;
export type StrategyBundleKey = Brandify<string, 'RecoveryStrategyKey'>;
export type RunManifestHash = Brandify<string, 'RunManifestHash'>;
export type StrategyRecommendationCode = Brandify<string, 'RecommendationCode'>;

export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type StressPhase = 'observe' | 'isolate' | 'simulate' | 'recommend' | 'restore' | 'verify';

export interface Recommendation {
  readonly code: StrategyRecommendationCode;
  readonly severity: Severity;
  readonly phase: StressPhase;
  readonly rationale: string;
  readonly affectedSignals: readonly string[];
  readonly estimatedMitigationMinutes: number;
}

export interface StrategyRoute {
  readonly key: StrategyBundleKey;
  readonly phaseSequence: readonly StressPhase[];
  readonly tags: readonly string[];
}

export interface StrategyBundle {
  readonly id: StrategyBundleId;
  readonly tenantId: string;
  readonly route: StrategyRoute;
  readonly manifestHash: RunManifestHash;
  readonly createdAt: string;
  readonly tags: readonly string[];
}

export interface StrategyPayload<TSignals extends readonly WorkloadSignal[]> {
  readonly bundle: StrategyBundle;
  readonly graph: WorkflowGraph;
  readonly signals: TSignals;
  readonly planNotes: readonly string[];
}

export interface StrategyResult<TSignals extends readonly WorkloadSignal[]> {
  readonly id: StrategyBundleId;
  readonly bundle: StrategyBundle;
  readonly recommendation: Recommendation;
  readonly payload: StrategyPayload<TSignals>;
}

export interface StrategyInput<TSignals extends readonly WorkloadSignal[]> {
  readonly tenantId: string;
  readonly runId: string;
  readonly signals: TSignals;
  readonly forecastScore: number;
}

export interface StrategyRuntimeManifest<TSignals extends readonly WorkloadSignal[]> {
  readonly bundle: StrategyBundle;
  readonly sequence: readonly StressPhase[];
  readonly signals: TSignals;
}

export interface StrategyPlan<TSignals extends readonly WorkloadSignal[]> {
  readonly bundle: StrategyBundle;
  readonly route: StrategyRoute;
  readonly tenantId: string;
  readonly input: StrategyInput<TSignals>;
  readonly graph: WorkflowGraph;
}

export type StrategyChainInput = {
  readonly tenantId: string;
  readonly graph: WorkflowGraph;
  readonly signals: readonly WorkloadSignal[];
};

export const withNoInfer = <T>(value: T): T => value;

const routeFromString = (value: string): StrategyRoute => {
  const phaseSequence = value
    .split(':')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part): part is StressPhase =>
      part === 'observe' ||
      part === 'isolate' ||
      part === 'simulate' ||
      part === 'recommend' ||
      part === 'restore' ||
      part === 'verify',
    );
  return {
    key: withBrand(`route:${value || 'default'}`, 'RecoveryStrategyKey'),
    phaseSequence,
    tags: ['derived', 'dsl'],
  };
};

export const createStrategyRoute = (tenantId: string, phases: readonly StressPhase[]): StrategyRoute => {
  const routeKey = withBrand(`${tenantId}:route`, 'RecoveryStrategyKey');
  return {
    key: routeKey,
    phaseSequence: [...phases],
    tags: ['strategy-route', tenantId],
  };
};

export const buildStrategyInput = <TSignals extends readonly WorkloadSignal[]>(
  tenantId: string,
  runId: string,
  signals: TSignals,
  forecastScore = 0.5,
): StrategyInput<TSignals> => ({
  tenantId,
  runId,
  signals,
  forecastScore,
});

export const buildStrategyPlan = <TSignals extends readonly WorkloadSignal[]>(
  input: StrategyInput<TSignals>,
  phases: readonly StressPhase[],
  graph: WorkflowGraph = { region: withBrand(input.tenantId, 'RegionId'), nodes: [], edges: [] },
): StrategyPlan<TSignals> => {
  const route = createStrategyRoute(input.tenantId, phases);
  const bundle = strategyBundleFromRoute(input.tenantId, input.runId, phases);
  return {
    bundle,
    route,
    tenantId: input.tenantId,
    input,
    graph,
  };
};

export const strategyBundleFromRoute = (tenantId: string, key: string, phases: readonly StressPhase[]): StrategyBundle => ({
  id: withBrand(`${tenantId}:${key}::bundle`, 'RecoveryStrategyBundleId'),
  tenantId,
  route: routeFromString(`${phases.join(':')}`),
  manifestHash: withBrand(`${tenantId}:${key}:manifest`, 'RunManifestHash'),
  createdAt: new Date().toISOString(),
  tags: ['stress'],
});

export const buildRecommendation = <TSignals extends readonly WorkloadSignal[]>(
  bundle: StrategyBundle,
  payload: StrategyPayload<TSignals>,
): Recommendation => ({
  code: withBrand(`${bundle.id}::recommend`, 'RecommendationCode'),
  severity: payload.signals.length > 2 ? 'medium' : 'low',
  phase: payload.bundle.route.phaseSequence[0] ?? 'recommend',
  rationale: payload.planNotes.at(-1) ?? 'no rationale available',
  affectedSignals: payload.signals.map((signal) => signal.id),
  estimatedMitigationMinutes: payload.signals.length * 4 + 5,
});

export const deriveRoute = (value: string): StrategyRoute => routeFromString(value);

export const buildPlanNotes = (
  graph: WorkflowGraph,
  signals: readonly WorkloadSignal[],
): readonly string[] => {
  const traversal = collectTraversal(graph, graph.nodes[0]?.id);
  const first = signals.map((signal) => `${signal.id}:${signal.score}`).join('|');
  return [
    `nodes=${graph.nodes.length}`,
    `edges=${graph.edges.length}`,
    `signals=${signals.length}`,
    `traversal=${traversal.length}`,
    `signal-set=${first}`,
  ];
};

export const buildPayload = <TSignals extends readonly WorkloadSignal[]>(
  tenantId: string,
  graph: WorkflowGraph,
  signals: TSignals,
): StrategyPayload<TSignals> => {
  const bundle = strategyBundleFromRoute(tenantId, `tenant:${tenantId}`, ['observe', 'simulate', 'recommend']);
  return {
    bundle,
    graph,
    signals,
    planNotes: buildPlanNotes(graph, signals),
  };
};

export const mapSignalKinds = <TSignals extends readonly WorkloadSignal[]>(signals: TSignals): Record<Severity, number> => {
  const grouped: Record<Severity, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  for (const signal of signals) {
    grouped[signal.score > 0.9 ? 'critical' : signal.score > 0.7 ? 'high' : signal.score > 0.4 ? 'medium' : 'low'] += 1;
  }

  return grouped;
};

export const inferRecommendationBySignals = <TSignals extends readonly WorkloadSignal[]>(
  payload: StrategyPayload<TSignals>,
): Recommendation => buildRecommendation(payload.bundle, payload);

const strategyNamespace = createPluginDefinitionNamespace('recovery:stress:lab');

type StrategyRuntimeContext = PluginContext<Record<string, unknown>>;

const asDependency = (id: PluginId): PluginDependency => `dep:${String(id)}` as PluginDependency;

const pluginContext = (tenantId: string): StrategyRuntimeContext =>
  createPluginContext(tenantId, strategyNamespace, `strategy-${tenantId}`, {
    tenantId,
  } as Record<string, unknown>);

const defaultStrategyPhases: readonly StressPhase[] = ['observe', 'simulate', 'recommend', 'restore'];

export const buildDefaultChain = (tenantId: string): readonly PluginDefinition[] => {
  const inspectPlugin = buildPluginDefinition(strategyNamespace, createPluginKind('inspect'), {
    name: 'inspect-stage',
    version: createPluginVersion(1, 0, 0),
    tags: ['inspect'],
    dependencies: [],
    pluginConfig: { tenantId },
    run: async (context: StrategyRuntimeContext, input: { tenantId: string; graph: WorkflowGraph; signals: readonly WorkloadSignal[] }) => {
      const tenantIdFromContext = typeof context.config.tenantId === 'string' ? context.config.tenantId : tenantId;
      const bundle = strategyBundleFromRoute(tenantIdFromContext, `tenant:${tenantId}:inspect`, defaultStrategyPhases);
      return {
        ok: true,
        value: {
          bundle,
          sequence: [...defaultStrategyPhases],
          signals: input.signals,
        } satisfies StrategyRuntimeManifest<readonly WorkloadSignal[]>,
        generatedAt: new Date().toISOString(),
      };
    },
  });

  const analyzePlugin = buildPluginDefinition(strategyNamespace, createPluginKind('analyze'), {
    name: 'analyze-stage',
    version: createPluginVersion(1, 0, 0),
    tags: ['analyze'],
    dependencies: [asDependency(inspectPlugin.id)],
    pluginConfig: { tenantId },
    run: async (_context: StrategyRuntimeContext, input: StrategyRuntimeManifest<readonly WorkloadSignal[]>) => ({
      ok: true,
      value: {
        bundle: input.bundle,
        sequence: [...input.sequence, 'verify'],
        signals: input.signals,
      },
      generatedAt: new Date().toISOString(),
    }),
  });

  return [inspectPlugin, analyzePlugin] as unknown as readonly PluginDefinition[];
};

export const executeStrategy = async <TSignals extends readonly WorkloadSignal[]>(
  tenantId: string,
  graph: WorkflowGraph,
  signals: TSignals,
): Promise<StrategyResult<TSignals>> => {
  const route = deriveRoute('observe:simulate:recommend');
  const bundle = strategyBundleFromRoute(tenantId, `${tenantId}:${route.key}`, route.phaseSequence);
  const payload: StrategyPayload<TSignals> = {
    bundle,
    graph,
    signals,
    planNotes: buildPlanNotes(graph, signals),
  };
  const recommendation = buildRecommendation(bundle, payload);
  const chain = buildDefaultChain(tenantId);

  const chainResult = await executePluginChain(
    chain as CompatibleChain<readonly PluginDefinition[]> & readonly PluginDefinition[],
    pluginContext(tenantId),
    {
      tenantId,
      graph,
      signals,
    } satisfies {
      tenantId: string;
      graph: WorkflowGraph;
      signals: TSignals;
    },
  );

  const strategyPayload: StrategyRuntimeManifest<TSignals> = chainResult.ok && chainResult.value
    ? (chainResult.value as StrategyRuntimeManifest<TSignals>)
    : {
        bundle,
        signals,
        sequence: route.phaseSequence,
      };

  return {
    id: strategyPayload.bundle.id,
    bundle: strategyPayload.bundle,
    recommendation,
    payload: {
      ...payload,
      planNotes: [
        ...payload.planNotes,
        `chain=${chainResult.ok ? 'ok' : 'fail'}`,
      ],
      signals: strategyPayload.signals,
      graph,
    },
  };
};

export const remapRoutes = <T extends readonly StrategyBundleKey[]>(routes: T): {
  [K in T[number]]: GraphRoute<K>;
} => {
  const out = {} as { [K in T[number]]: GraphRoute<K> };
  for (const route of routes) {
    out[route as T[number]] = `route:${route}`;
  }
  return out;
};

type GraphRoute<T extends string> = `route:${T}`;

export const summarizeBundle = <TSignals extends readonly WorkloadSignal[]>(bundle: StrategyBundle, signals: TSignals): string => {
  const grouped = mapSignalKinds(signals);
  const risk = grouped.critical + grouped.high;
  return `${bundle.id}|${signals.length}|risk:${risk}`;
};

const isCritical = (recommendation: Recommendation): boolean => recommendation.severity === 'critical';

export const buildRecoverySummary = <TSignals extends readonly WorkloadSignal[]>(
  strategy: StrategyResult<TSignals>,
): {
  readonly run: StrategyBundleId;
  readonly status: 'safe' | 'at-risk';
  readonly planTags: readonly string[];
} => ({
  run: strategy.id,
  status: isCritical(strategy.recommendation) ? 'at-risk' : 'safe',
  planTags: strategy.payload.bundle.tags,
});

export const normalizeRoute = (bundle: StrategyBundle): StrategyRoute => ({
  key: withBrand(String(bundle.route.key), 'RecoveryStrategyKey'),
  phaseSequence: [...bundle.route.phaseSequence],
  tags: [...bundle.route.tags, 'normalized'],
});
