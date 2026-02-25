import {
  type CompatibleChain,
  buildPluginDefinition,
  canonicalizeNamespace,
  type PluginContext,
  type PluginDefinition,
  type PluginDependency,
  type PluginKind,
  type PluginResult,
  buildPluginVersion,
  executePluginChain,
} from '@shared/stress-lab-runtime';
import {
  type RecoverySignal,
  type RecoverySignalId,
  type SeverityBand,
  type StageSignal,
  type TenantId,
  WorkloadTopology,
  createSignalId,
  parseRecoverySignals,
} from '@domain/recovery-stress-lab';
import { NoInfer } from '@shared/type-level';
import { toTuple } from '@shared/type-level';

export type SignalCatalogKind =
  | 'stress-lab/signal/collect'
  | 'stress-lab/signal/rank'
  | 'stress-lab/signal/summarize'
  | 'stress-lab/signal/snapshot';

export interface SignalChainInput {
  readonly tenantId: TenantId;
  readonly topology: WorkloadTopology;
  readonly rawSignals: readonly unknown[];
  readonly preferredBands: readonly SeverityBand[];
}

export interface SignalParsedOutput {
  readonly tenantId: TenantId;
  readonly signature: string;
  readonly signals: readonly StageSignal[];
}

export interface SignalRankedOutput {
  readonly tenantId: TenantId;
  readonly ranked: readonly StageSignal[];
  readonly summary: {
    readonly critical: number;
    readonly high: number;
    readonly medium: number;
    readonly low: number;
    readonly preferredBands: readonly SeverityBand[];
  };
  readonly preferredBands: readonly SeverityBand[];
  readonly signalIds: readonly RecoverySignalId[];
}

export interface SignalSummarizedOutput {
  readonly tenantId: TenantId;
  readonly signature: string;
  readonly signalCount: number;
  readonly bands: readonly SeverityBand[];
  readonly preferredBands: readonly SeverityBand[];
  readonly signalIds: readonly RecoverySignalId[];
}

export interface SignalSnapshotOutput {
  readonly tenantId: TenantId;
  readonly topologyNodeCount: number;
  readonly topologyEdgeCount: number;
  readonly digest: string;
  readonly signalIds: readonly RecoverySignalId[];
}

export interface SignalChainEvent {
  readonly at: string;
  readonly plugin: PluginKind;
  readonly status: 'ok' | 'warn';
}

const signalChainCatalogConfig = { step: 0 } as const;
const signalChainStep = (step: number): Record<string, unknown> => ({ step }) as Record<string, unknown>;

const namespace = canonicalizeNamespace('recovery:stress-lab-signal');
const pluginNamespace = canonicalizeNamespace('recovery:stress-lab-orchestrator');
const pluginDeps: Record<SignalCatalogKind, PluginDependency[]> = {
  'stress-lab/signal/collect': [] as PluginDependency[],
  'stress-lab/signal/rank': ['dep:signal:collect' as PluginDependency],
  'stress-lab/signal/summarize': ['dep:signal:rank' as PluginDependency],
  'stress-lab/signal/snapshot': ['dep:signal:summarize' as PluginDependency],
};

const collectPlugin = buildPluginDefinition(
  pluginNamespace,
  'stress-lab/signal/collect',
  {
    name: 'collect-signals',
    version: buildPluginVersion(1, 0, 0),
    tags: ['signal', 'collect'],
    dependencies: pluginDeps['stress-lab/signal/collect'],
    pluginConfig: signalChainStep(1),
    run: async (_context: PluginContext<Record<string, unknown>>, input: SignalChainInput): Promise<PluginResult<SignalParsedOutput>> => {
      const parsed = parseRecoverySignals(input.tenantId, input.rawSignals);
      return {
        ok: true,
        value: {
          tenantId: input.tenantId,
          signature: `${input.tenantId}:${input.rawSignals.length}:${parsed.signature}`,
          signals: parsed.raw,
        },
        generatedAt: new Date().toISOString(),
      };
    },
  },
);

const rankPlugin = buildPluginDefinition(
  pluginNamespace,
  'stress-lab/signal/rank',
  {
    name: 'rank-signals',
    version: buildPluginVersion(1, 1, 0),
    tags: ['signal', 'rank'],
    dependencies: pluginDeps['stress-lab/signal/rank'],
    pluginConfig: signalChainStep(2),
    run: async (
      _context: PluginContext<Record<string, unknown>>,
      payload: SignalParsedOutput,
    ): Promise<PluginResult<SignalRankedOutput>> => {
      const summary = payload.signals.reduce(
        (acc, signal) => {
          return {
            ...acc,
            critical: acc.critical + (signal.severity === 'critical' ? 1 : 0),
            high: acc.high + (signal.severity === 'high' ? 1 : 0),
            medium: acc.medium + (signal.severity === 'medium' ? 1 : 0),
            low: acc.low + (signal.severity === 'low' ? 1 : 0),
          };
        },
        {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          preferredBands: ['critical', 'high', 'medium', 'low'] as const,
        } as SignalRankedOutput['summary'],
      );

      return {
        ok: true,
        value: {
        tenantId: payload.tenantId,
        ranked: [...payload.signals].sort((left, right) => right.score - left.score),
        summary,
        preferredBands: summary.preferredBands,
        signalIds: payload.signals.map((signal) => signal.signal),
      },
        generatedAt: new Date().toISOString(),
      };
    },
  },
);

const summarizePlugin = buildPluginDefinition(
  pluginNamespace,
  'stress-lab/signal/summarize',
  {
    name: 'summarize-signals',
    version: buildPluginVersion(1, 2, 0),
    tags: ['signal', 'summarize'],
    dependencies: pluginDeps['stress-lab/signal/summarize'],
    pluginConfig: signalChainStep(3),
    run: async (
      _context: PluginContext<Record<string, unknown>>,
      payload: SignalRankedOutput,
    ): Promise<PluginResult<SignalSummarizedOutput>> => {
      const digest = payload.ranked.reduce(
        (acc, signal) => `${acc}-${signal.signal}`,
        `${payload.tenantId}`,
      );
      const uniqueBands = [...new Set(payload.ranked.map((signal) => signal.severity))] as SeverityBand[];
      return {
        ok: true,
        value: {
          tenantId: payload.tenantId,
          signature: digest,
          signalCount: payload.ranked.length,
          bands: uniqueBands,
          preferredBands: payload.preferredBands,
          signalIds: payload.signalIds,
        },
        generatedAt: new Date().toISOString(),
      };
    },
  },
);

const snapshotPlugin = buildPluginDefinition(
  pluginNamespace,
  'stress-lab/signal/snapshot',
  {
    name: 'snapshot-signals',
    version: buildPluginVersion(1, 3, 0),
    tags: ['signal', 'snapshot'],
    dependencies: pluginDeps['stress-lab/signal/snapshot'],
    pluginConfig: signalChainStep(4),
    run: async (
      _context: PluginContext<Record<string, unknown>>,
      payload: SignalSummarizedOutput,
    ): Promise<PluginResult<SignalSnapshotOutput>> => {
      const signalIds = toTuple(payload.signalIds.map((id) => createSignalId(`${payload.tenantId}:${id}`))) as readonly RecoverySignalId[];
      return {
        ok: true,
        value: {
          tenantId: payload.tenantId,
          topologyNodeCount: payload.signalCount,
          topologyEdgeCount: payload.bands.length,
          digest: `${payload.signature}:${payload.bands.length}:${signalIds.length}`,
          signalIds,
        },
        generatedAt: new Date().toISOString(),
      };
    },
  },
);

const signalChain = [
  collectPlugin,
  rankPlugin,
  summarizePlugin,
  snapshotPlugin,
] as const as readonly PluginDefinition[];

export type SignalChain = typeof signalChain;

export const buildSignalChain = (): SignalChain => {
  return signalChain;
};

export const toSignalCatalogDigest = (input: SignalChainInput): string => {
  return `${input.tenantId}-${input.topology.nodes.length}x${input.topology.edges.length}`;
};

export const runSignalChain = async (
  input: NoInfer<SignalChainInput>,
): Promise<{ readonly chain: SignalSnapshotOutput; readonly events: readonly SignalChainEvent[] }> => {
  const context: PluginContext<Record<string, unknown>> = {
    tenantId: input.tenantId,
    requestId: `orchestrator-${input.tenantId}:${Date.now()}`,
    namespace,
    startedAt: new Date().toISOString(),
    config: signalChainCatalogConfig,
  };

  const chain = buildSignalChain();
  const orderedEvents = chain.map((plugin, index): SignalChainEvent => ({
    at: `${new Date().toISOString()}#${index}`,
    plugin: plugin.kind,
    status: 'ok',
  }));

  const result = await executePluginChain(chain as CompatibleChain<SignalChain>, context, {
    tenantId: input.tenantId,
    topology: input.topology,
    rawSignals: input.rawSignals,
    preferredBands: input.preferredBands,
  });

  if (!result.ok || result.value === undefined) {
    return {
      chain: {
        tenantId: input.tenantId,
        topologyNodeCount: input.topology.nodes.length,
        topologyEdgeCount: input.topology.edges.length,
        digest: toSignalCatalogDigest(input),
        signalIds: [],
      },
      events: orderedEvents,
    };
  }

  return {
    chain: result.value,
    events: orderedEvents,
  };
};
