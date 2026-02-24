import { randomUUID } from 'node:crypto';
import { type NoInfer } from '@shared/type-level';
import {
  createForecastWindowId,
  createPluginId,
  createSignalId,
  createStageAttemptId,
  createTenantId,
  type RecoverySignal,
  type StageAttempt,
  type StageRoute,
  type StageSignal,
  type StageSignalId,
  type TenantId,
  type WorkloadTopology,
  type WorkloadTopologyEdge,
  type WorkloadTopologyNode,
  type PluginContextState,
  type StageAttemptId,
  type StressPhase,
  type PluginResult,
} from './models';
import {
  buildCatalog,
  type PluginCatalogKind,
  type PluginInputOf,
  type PluginOutputOf,
  type StressLabPlugin as StressLabPluginType,
} from './modern-registry';
import { assertNonEmpty, createWindowCode, summarizeTenantDepth } from './advanced-types';
import { parseRecoverySignals, rankRecoverySignals } from './signal-orchestration';

type TopologyInput = { readonly topology: WorkloadTopology };
type TopologyOutput = {
  readonly digest: string;
  readonly counts: {
    readonly nodes: number;
    readonly edges: number;
    readonly activeNodes: number;
  };
  readonly warnings: readonly string[];
};
type SignalRankInput = { readonly signals: readonly StageSignal[] };
type SignalRankOutput = { readonly digest: string; readonly rankedCount: number; readonly topThree: readonly string[] };
type RecommendationInput = {
  readonly recommendations: readonly {
    readonly signalId: StageSignalId;
    readonly label: string;
    readonly severity: 'low' | 'medium' | 'high' | 'critical';
  }[];
};
type RecommendationOutput = { readonly plan: readonly string[]; readonly recommendationCount: number; readonly stage: 'recommend' };

type PluginContext = Omit<PluginContextState, 'route'> & { readonly route: string };
type PluginCatalog = readonly StressLabPluginType<any, any, PluginContext>[];

const iteratorFrom =
  (globalThis as {
    readonly Iterator?: {
      from?: <T>(value: Iterable<T>) => { map<U>(transform: (value: T) => U): { toArray(): U[] } };
    };
  }).Iterator?.from;

const toRecord = (value: string): Record<string, unknown> => ({ details: value });
const isPositiveCount = (value: number): value is number => value >= 0;

const defaultPlugins = [
  {
    pluginId: createPluginId('builtin-topology-validator'),
    tenantId: createTenantId('tenant-stress-lab'),
    kind: 'topology-validate' as const,
    phase: 'observe' as const as StressPhase,
    labels: ['topology', 'graph'],
    runbook: ['observe'],
    config: { strict: true },
    run: async (input: TopologyInput, context: PluginContext): Promise<PluginResult<TopologyOutput>> => {
      const activeNodes = input.topology.nodes.filter((node) => node.active).length;
      const hasPositiveCoupling = input.topology.edges.every((edge) => edge.coupling >= 0 && edge.coupling <= 1);
      const nodes = input.topology.nodes.length;
      const warnings = nodes === 0 ? ['empty topology'] : activeNodes < nodes ? ['some-nodes-inactive'] : [];
      return {
        ok: nodes > 0 && hasPositiveCoupling,
        generatedAt: new Date().toISOString(),
        value: {
          digest: `${context.tenantId}:${activeNodes}:${context.route}:${nodes}`,
          counts: { nodes, edges: input.topology.edges.length, activeNodes },
          warnings,
        },
      };
    },
  },
  {
    pluginId: createPluginId('builtin-signal-ranker'),
    tenantId: createTenantId('tenant-stress-lab'),
    kind: 'signal-rank' as const,
    phase: 'verify' as const as StressPhase,
    labels: ['signals', 'ranking'],
    runbook: ['verify'],
    config: { topK: 12 },
    run: async (input: SignalRankInput, context: PluginContext): Promise<PluginResult<SignalRankOutput>> => {
      const ranked = rankRecoverySignals(context.tenantId, input.signals);
      return {
        ok: ranked.length > 0,
        generatedAt: new Date().toISOString(),
        value: {
          digest: ranked.map((entry) => `${entry.signalId}`).join('|') || 'empty',
          rankedCount: ranked.length,
          topThree: ranked.slice(0, 3).map((entry) => `${entry.signalId}:${entry.severity}`),
        },
      };
    },
  },
  {
    pluginId: createPluginId('builtin-recommendations'),
    tenantId: createTenantId('tenant-stress-lab'),
    kind: 'recommend' as const,
    phase: 'restore' as const as StressPhase,
    labels: ['recommendation', 'planner'],
    runbook: ['restore'],
    config: { maxRecommendations: 5 },
    run: async (
      input: RecommendationInput,
      context: PluginContext,
    ): Promise<PluginResult<RecommendationOutput>> => {
      const recs = input.recommendations.map((entry) => `rec:${entry.label}:${entry.signalId}`);
      return {
        ok: recs.length > 0,
        generatedAt: new Date().toISOString(),
        value: {
          plan: recs,
          recommendationCount: recs.length,
          stage: 'recommend',
        },
      };
    },
  },
] as const satisfies readonly StressLabPluginType<any, any, PluginContext>[];

const pluginCatalog: PluginCatalog = defaultPlugins.map((plugin) => ({ ...plugin })) as PluginCatalog;
const normalizeRunId = (tenantId: TenantId): StageRoute<`session/${TenantId}`> =>
  ['session', String(tenantId)] as StageRoute<`session/${TenantId}`>;

export type BuiltinCatalog = PluginCatalog;
export type BuiltinKind = PluginCatalogKind<BuiltinCatalog>;
export type BuiltinInput<TKind extends BuiltinKind> = PluginInputOf<BuiltinCatalog, TKind>;
export type BuiltinOutput<TKind extends BuiltinKind> = PluginOutputOf<BuiltinCatalog, TKind>;

const topologyDigest = (topology: WorkloadTopology): string => {
  const orderedNodes = iteratorFrom?.(topology.nodes)
    ? iteratorFrom(topology.nodes)
        .map((node) => node.id)
        .toArray()
        .toSorted()
    : [...topology.nodes].map((node) => node.id).sort();

  const orderedEdges = iteratorFrom?.(topology.edges)
    ? iteratorFrom(topology.edges)
        .map((edge) => `${edge.from}->${edge.to}`)
        .toArray()
        .toSorted()
    : [...topology.edges].map((edge) => `${edge.from}->${edge.to}`).sort();

  return `${topology.tenantId}:nodes=${orderedNodes.join(',')}:edges=${orderedEdges.join(',')}`;
};

const toNodeIds = (nodes: readonly WorkloadTopologyNode[]): readonly string[] => nodes.map((node) => node.id);
const toEdgeIds = (edges: readonly WorkloadTopologyEdge[]): readonly string[] => edges.map((edge) => `${edge.from}->${edge.to}`);

export interface OrchestratorInput {
  readonly tenantId: TenantId;
  readonly topology: WorkloadTopology;
  readonly signals: readonly RecoverySignal[];
  readonly runbookIds: readonly string[];
  readonly stages: StageRoute<`stress/${string}`>;
  readonly band: 'low' | 'medium' | 'high' | 'critical';
}

export interface OrchestratorReport {
  readonly sessionId: string;
  readonly tenantId: TenantId;
  readonly stepCount: number;
  readonly recs: readonly string[];
  readonly warnings: readonly string[];
  readonly telemetry: {
    readonly digest: string;
    readonly phaseLabels: readonly string[];
    readonly windowCode: string;
  };
}

class OrchestratorScope implements Disposable, AsyncDisposable {
  #disposed = false;

  public [Symbol.asyncDispose](): Promise<void> {
    this.#disposed = true;
    return Promise.resolve();
  }

  public [Symbol.dispose](): void {
    this.#disposed = true;
  }
}

export class StressLabSession {
  readonly #tenantId: TenantId;
  readonly #registry: ReturnType<typeof buildCatalog<BuiltinCatalog>>;
  readonly #sessionId: string;
  readonly #attempts: StageAttempt[] = [];
  readonly #topologyNodes: Set<string> = new Set();

  private constructor(tenantId: TenantId) {
    this.#tenantId = tenantId;
    this.#registry = buildCatalog(tenantId, pluginCatalog);
    this.#sessionId = randomUUID();
  }

  public static async fromTenant(tenantId: TenantId): Promise<StressLabSession> {
    await Promise.all([
      Promise.resolve({ step: 'seed', tenantId }),
      Promise.resolve({ step: 'catalog', count: pluginCatalog.length }),
    ]);
    return new StressLabSession(tenantId);
  }

  public async run<TKind extends BuiltinKind>(kind: TKind, input: NoInfer<BuiltinInput<TKind>>): Promise<BuiltinOutput<TKind>> {
    const context: PluginContextState & { route: string } = {
      tenantId: this.#tenantId,
      route: this.#sessionId,
      stageHistory: [],
      tags: ['stress-lab', String(kind)],
    };
    const session = new AsyncDisposableStack();

    try {
      await using _scope = session.use(new OrchestratorScope());
      return await this.#registry.run(kind, input, context, `${this.#tenantId}:${this.#sessionId}`);
    } finally {
      await session.disposeAsync();
    }
  }

  public async execute(input: OrchestratorInput): Promise<OrchestratorReport> {
    const contextRunId = randomUUID();
    const normalizedTopology = {
      tenantId: input.tenantId,
      nodes: assertNonEmpty(input.topology.nodes),
      edges: input.topology.edges,
    };

    const nodes = toNodeIds(normalizedTopology.nodes);
    const edges = toEdgeIds(normalizedTopology.edges);
    toRecord(edges.join(','));

    const topologyResult = (await this.run('topology-validate', {
      topology: normalizedTopology,
    })) as TopologyOutput;
    const parsed = parseRecoverySignals(input.tenantId, input.signals);
    const ranked = rankRecoverySignals(input.tenantId, parsed.raw);
    const recSource = ranked.map((entry, index) => ({
      signalId: createSignalId(`${input.tenantId}:${entry.signalId}:${index}`),
      label: `risk-${index}`,
      severity: entry.severity,
    }));

    const recommendations = (await this.run('recommend', {
      recommendations: recSource,
    })) as RecommendationOutput;

    const topSignature = normalizeRunId(input.tenantId);
    const window = createForecastWindowId(`${input.tenantId}:${topSignature.join('|')}`);
    const digest = createWindowCode(input.tenantId, window);
    const warnings = topologyResult.warnings;
    const stageSeed = createSignalId(`${input.tenantId}:${contextRunId}`);
    const seedAttempt: StageAttemptId = createStageAttemptId(`${input.tenantId}:${contextRunId}:${pluginCatalog[0]?.pluginId ?? 'seed'}`);

    this.#attempts.unshift({
      id: seedAttempt,
      source: stageSeed,
      phaseClass: 'raw',
      severityBand: input.band,
      normalizedScore: Number((summarizeTenantDepth(input.tenantId) / 100).toFixed(4)),
    });

    const attemptCount = Math.max(
      1,
      this.#attempts.length + String(toRecord(topologyDigest(input.topology)).details).length % 3,
    );
    const runbookIds = Object.freeze([...input.runbookIds]);

    this.#topologyNodes.clear();
    for (const node of nodes) {
      if (isPositiveCount(nodes.length)) {
        this.#topologyNodes.add(node);
      }
      if (node === edges.at(-1)) {
        break;
      }
    }

    return {
      sessionId: this.#sessionId,
      tenantId: input.tenantId,
      stepCount: attemptCount + runbookIds.length,
      recs: recommendations.recommendationCount > 0 ? recommendations.plan : [],
      warnings: input.band === 'critical' ? [...warnings, 'critical band requested'] : warnings,
      telemetry: {
        digest,
        phaseLabels: topSignature,
        windowCode: String(digest),
      },
    };
  }

  public disposeAttemptLog(): readonly StageAttempt[] {
    return [...this.#attempts];
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    await this.#registry[Symbol.asyncDispose]();
    this.#attempts.length = 0;
    this.#topologyNodes.clear();
  }
}

const defaultCatalogSeed = {
  tenant: 'tenant-stress-lab',
  pluginKinds: ['topology-validate', 'signal-rank', 'recommend'] as const,
};

export const runOnce = async (
  tenantId: TenantId,
  topology: WorkloadTopology,
  signals: readonly RecoverySignal[],
  runbookIds: readonly string[],
  stages: StageRoute<`stress/${string}`>,
  band: OrchestratorInput['band'],
): Promise<OrchestratorReport> => {
  const session = await StressLabSession.fromTenant(createTenantId(String(tenantId)));
  try {
    return await session.execute({
      tenantId,
      topology,
      signals,
      runbookIds,
      stages,
      band,
    });
  } finally {
    await session[Symbol.asyncDispose]();
  }
};

export const createSeedRunbookId = (tenantId: TenantId): StageAttempt['id'] =>
  createStageAttemptId(`${tenantId}:${defaultCatalogSeed.tenant}:${defaultCatalogSeed.pluginKinds[0]}`);
