import { z } from 'zod';
import {
  type CommandRunbook,
  type CommandRunbookId,
  type RecoverySignal,
  type RecoverySignalId,
  type SeverityBand,
  type TenantId,
  type WorkloadId,
  type WorkloadTopology,
  type WorkloadTopologyEdge,
  type WorkloadTopologyNode,
  createRunbookId,
  createSignalId,
  createTenantId,
  createWorkloadId,
  severityRank,
} from './models';
import {
  defaultCatalog,
  defaultCatalogResult,
  resolveCatalogDependencyGraph,
  runCatalogSeedSafe,
  type PluginCatalogSeed,
} from '@shared/stress-lab-runtime/plugin-catalog-extensions';
import { buildCatalogFingerprint, buildSnapshot } from '@shared/stress-lab-runtime/plugin-catalog-extensions';
import { PluginId } from '@shared/stress-lab-runtime/ids';
import { createPluginTelemetryStore, buildTelemetryFingerprint } from '@shared/stress-lab-runtime/plugin-telemetry';
import { PluginSession, pluginSessionConfigFrom, withAsyncPluginScope } from '@shared/stress-lab-runtime/lifecycle';
import { runWorkspace } from '@shared/stress-lab-runtime/plugin-chain-executor';
import { collectIterable, chunkIterable } from '@shared/stress-lab-runtime/iterator-utils';
import { canonicalizeNamespace, type PluginKind } from '@shared/stress-lab-runtime/ids';
import { normalizeTopology } from './topology-intelligence';

export type WorkbenchMode = 'plan' | 'simulate' | 'recommend' | 'report';
export type WorkbenchRoute<T extends string> = T extends `${infer Head}/${infer Tail}`
  ? readonly [Head, ...WorkbenchRoute<Tail>]
  : readonly [T];
export type WorkbenchEvent<TName extends string = string> = `${WorkbenchMode}:${TName}:${string}`;

export interface WorkbenchFixture {
  readonly tenantId: TenantId;
  readonly scenario: string;
  readonly selectedRunbooks: readonly CommandRunbookId[];
  readonly selectedSignals: readonly RecoverySignalId[];
  readonly mode: WorkbenchMode;
}

export interface TopologySummary {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly criticalityByTeam: Readonly<Record<string, number>>;
  readonly maxCoupling: number;
}

export interface TopologyRow {
  readonly from: WorkloadId;
  readonly to: WorkloadId;
  readonly coupledWith: number;
}

export interface ScenarioPlanDraft {
  readonly tenantId: TenantId;
  readonly scenario: string;
  readonly runbookIds: readonly CommandRunbookId[];
  readonly runbookFingerprint: string;
  readonly routingTable: Readonly<Record<string, readonly string[]>>;
}

const defaultTenant = createTenantId('tenant-recovery-stress');
export const WORKBENCH_DEFAULT_FINGERPRINT = buildCatalogFingerprint(defaultCatalog);

const topologySchema = z.object({
  tenantId: z.union([z.string().min(3), z.undefined()]),
  nodes: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      ownerTeam: z.string().min(1),
      criticality: z.number().min(1).max(5),
      active: z.boolean(),
    }),
  ),
  edges: z.array(
    z.object({
      from: z.string().min(1),
      to: z.string().min(1),
      coupling: z.number().min(0).max(1),
      reason: z.string().min(1),
    }),
  ),
});

const planInputSchema = z.object({
  tenantId: z.string().min(1),
  scenario: z.string().min(1),
  selectedRunbookIds: z.array(z.string().min(1)),
  selectedSignalIds: z.array(z.string().min(1)),
  mode: z.enum(['plan', 'simulate', 'recommend', 'report']),
});

const defaultRawFixture = {
  tenantId: defaultTenant,
  scenario: 'chaos:redis-failover',
  selectedRunbookIds: ['rb:mongo-rollout', 'rb:storage-drain'],
  selectedSignalIds: ['sig:region-outage', 'sig:lag-spike'],
  mode: 'plan',
} as const;

export const defaultFixture = planInputSchema.parse(defaultRawFixture);

const normalizeWorkbenchTopology = (topology: unknown): WorkbenchTopology => {
  const parsed = topologySchema.parse(topology);
  const normalized = normalizeTopology({
    tenantId: createTenantId(String(parsed.tenantId ?? defaultTenant)),
    nodes: parsed.nodes.map((entry) => ({
      id: createWorkloadId(entry.id),
      name: entry.name,
      ownerTeam: entry.ownerTeam,
      criticality: Math.max(1, Math.min(5, Math.round(entry.criticality))) as WorkloadTopologyNode['criticality'],
      active: entry.active,
    })),
    edges: parsed.edges.map((entry) => ({
      from: createWorkloadId(entry.from),
      to: createWorkloadId(entry.to),
      coupling: entry.coupling,
      reason: entry.reason,
    })),
  });
  return normalized;
};

type WorkbenchTopology = WorkloadTopology;

export const normalizeWorkbenchTopologyFromUnknown = (topology: unknown): WorkloadTopology => normalizeWorkbenchTopology(topology);

export const normalizeFixture = (value: {
  tenantId: string;
  scenario: string;
  selectedRunbookIds: readonly string[];
  selectedSignalIds: readonly string[];
  mode: WorkbenchMode;
}): WorkbenchFixture => ({
  tenantId: createTenantId(value.tenantId),
  scenario: value.scenario.trim(),
  selectedRunbooks: value.selectedRunbookIds.map((id) => createRunbookId(id)),
  selectedSignals: value.selectedSignalIds.map((id) => createSignalId(id)),
  mode: value.mode,
});

export const summarizeTopology = (topology: WorkloadTopology): TopologySummary => {
  const tenantCriticality = topology.nodes.reduce<Record<string, number>>((acc, node) => {
    const score = severityRank[node.active ? 'critical' : 'low'];
    acc[node.ownerTeam] = (acc[node.ownerTeam] ?? 0) + score * node.criticality;
    return acc;
  }, {});
  const maxCoupling = topology.edges.reduce((acc, edge) => Math.max(acc, edge.coupling), 0);

  return {
    nodeCount: topology.nodes.length,
    edgeCount: topology.edges.length,
    criticalityByTeam: tenantCriticality,
    maxCoupling,
  };
};

export const rankTopologyRows = (edges: readonly WorkloadTopologyEdge[]): readonly TopologyRow[] => {
  return [...edges]
    .sort((left, right) => right.coupling - left.coupling)
    .map((entry) => ({
      from: entry.from,
      to: entry.to,
      coupledWith: entry.coupling,
    }))
    .slice(0, Math.min(edges.length, 512));
};

const buildFallbackSignals = (seed: string): readonly RecoverySignal[] => [
  {
    id: createSignalId(`${seed}-signal-0`),
    class: 'availability',
    severity: 'high',
    title: `Derived signal ${seed}`,
    createdAt: new Date().toISOString(),
    metadata: { source: 'workbench-fallback' },
  },
];

export const inferSignalsFromTopology = (topology: WorkloadTopology): readonly RecoverySignal[] =>
  topology.nodes.flatMap((node, index) =>
    buildFallbackSignals(`${node.ownerTeam}-${node.id}-${index}`).filter(
      (entry) => entry.severity === 'high' || entry.class === 'availability' || node.criticality >= 2,
    ),
  );

export const buildRoutingTable = <TSignals extends readonly RecoverySignal[]>(
  signals: TSignals,
): Readonly<Record<SeverityBand, number>> => {
  const total = signals.reduce<Record<SeverityBand, number>>(
    (acc, signal) => {
      acc[signal.severity] = (acc[signal.severity] ?? 0) + 1;
      return acc;
    },
    {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    },
  );
  return { ...total };
};

export const summarizeSignals = (signals: readonly RecoverySignal[]): readonly { signalId: string; title: string; severity: number }[] =>
  signals
    .toSorted((left, right) => severityRank[right.severity] - severityRank[left.severity])
    .map((signal) => ({
      signalId: signal.id,
      title: signal.title,
      severity: severityRank[signal.severity],
    }));

export const splitByChunk = <T>(values: readonly T[], size: number): readonly (readonly T[])[] => {
  return collectIterable(chunkIterable(values, Math.max(1, size)));
};

export const flattenRoute = (route: readonly unknown[]): string =>
  route.map((entry) => String(entry)).join('>');

export const buildTopologyFingerprint = (
  nodes: readonly WorkloadTopologyNode[],
  edges: readonly WorkloadTopologyEdge[],
): string =>
  nodes
    .map((node) => `${node.ownerTeam}-${node.criticality}`)
    .concat(edges.map((edge) => `${edge.from}-${edge.to}:${edge.coupling}`))
    .sort()
    .join('|');

export const buildDraft = (
  tenantId: TenantId,
  scenario: string,
  selectedRunbooks: readonly CommandRunbook[],
  routing: Readonly<Record<string, readonly string[]>>,
): ScenarioPlanDraft => ({
  tenantId,
  scenario,
  runbookIds: selectedRunbooks.map((runbook) => runbook.id),
  runbookFingerprint: selectedRunbooks.map((runbook) => runbook.id).join('|').slice(0, 240),
  routingTable: routing,
});

export const buildWorkspacePlan = async (fixture: WorkbenchFixture): Promise<ScenarioPlanDraft> => {
  const catalog = defaultCatalog;
  const graph = resolveCatalogDependencyGraph(catalog);
  const routing: Record<string, readonly string[]> = {};

  for (const [index, entry] of graph.ordered.entries()) {
    routing[String(entry.name)] = [String(index), entry.kind, ...entry.tags];
  }

  return {
    tenantId: fixture.tenantId,
    scenario: fixture.scenario,
    runbookIds: fixture.selectedRunbooks,
    runbookFingerprint: `${graph.tags.join('|')}|${fixture.selectedSignals.length}`,
    routingTable: routing,
  };
};

export const runWorkbench = async (
  fixture: WorkbenchFixture,
  runbooks: readonly CommandRunbook[],
): Promise<{ ok: boolean; runId: string; trace: readonly string[] }> => {
  const catalog = defaultCatalog;
  const session = new PluginSession(
    pluginSessionConfigFrom('workbench', canonicalizeNamespace('recovery:stress:lab:workbench'), `workbench-${fixture.scenario}`),
  );
  const runId = `${fixture.tenantId}:${fixture.scenario}:${Date.now()}`;
  const trace: string[] = [];

  await using _scope = session;

  const route = [fixture.mode] as const;
  const chainInput = {
    tenantId: String(fixture.tenantId),
    scenario: fixture.scenario,
    topology: normalizeWorkbenchTopology({ tenantId: String(fixture.tenantId), nodes: [], edges: [] }),
    selectedRunbooks: fixture.selectedRunbooks,
    selectedSignals: fixture.selectedSignals,
    recommendations: runbooks.map((runbook) => runbook.id),
    route,
  };

  const execution = await withAsyncPluginScope(
    {
      tenantId: String(fixture.tenantId),
      namespace: canonicalizeNamespace('recovery:stress:lab:workbench'),
      requestId: `scope:${runId}`,
      startedAt: new Date().toISOString(),
    },
    async () => runWorkspace(runId, catalog, chainInput),
  );

  const telemetryStore = createPluginTelemetryStore(String(fixture.tenantId), 'stress-lab/telemetry');
  const telemetryPluginId = `workbench:${fixture.tenantId}` as PluginId;
  telemetryStore.emit('info', telemetryPluginId, `executed ${execution.traces.length} traces`, [execution.traces.length]);
  const fingerprint = buildTelemetryFingerprint(telemetryStore.snapshot());

  trace.push(`run:${runId}:${execution.ok ? 'ok' : 'fail'}`);
  trace.push(`catalog:${fingerprint}`);
  if (execution.traces.length > 0) {
    trace.push(`trace-count:${execution.traces.length}`);
    trace.push(...execution.traces.map((entry) => `${entry.status}:${entry.pluginId}`));
  }

  if (catalog.length > 0) {
    const snapshot = await buildSnapshot(catalog);
    trace.push(`snapshot:${snapshot.namespace}:${snapshot.count}`);
  }

  if (defaultCatalogResult.errors.length > 0) {
    trace.push(`catalog-errors:${defaultCatalogResult.errors.length}`);
  }

  return {
    ok: defaultCatalogResult.ok,
    runId,
    trace,
  };
};

export type WorkbenchAuditRow = {
  readonly path: string;
  readonly severity: SeverityBand;
  readonly value: number;
};

export const buildWorkbenchAudit = (nodes: readonly WorkloadTopologyNode[]): readonly WorkbenchAuditRow[] =>
  nodes.map((node, index) => ({
    path: flattenRoute([node.id, node.name, `${node.criticality}`] as const),
    severity: node.criticality >= 4 ? 'critical' : node.criticality >= 3 ? 'high' : node.criticality >= 2 ? 'medium' : 'low',
    value: index + node.criticality,
  }));

export const estimateWorkloadExposure = (
  nodes: readonly WorkloadTopologyNode[],
  signals: readonly RecoverySignal[],
): number => {
  const routing = buildRoutingTable(signals);
  const raw = nodes.reduce((acc, node) => acc + node.criticality * (1 + routing[node.ownerTeam ? 'high' : 'low']), 0);
  return Number((raw / Math.max(1, nodes.length)).toFixed(2));
};

export const createTelemetryForWorkload = (
  tenantId: TenantId,
  runId: string,
  topology: WorkloadTopology,
): { summary: string; store: ReturnType<typeof createPluginTelemetryStore> } => {
  const store = createPluginTelemetryStore(tenantId, 'stress-lab/telemetry');
  const fingerprint = buildTopologyFingerprint(topology.nodes, topology.edges);
  const telemetryPluginId = `workbench:${runId}` as PluginId;
  store.emit('info', telemetryPluginId, `workbench ${runId} fingerprint ${fingerprint}`, [topology.nodes.length]);
  return {
    summary: buildTelemetryFingerprint(store.snapshot()),
    store,
  };
};

export const describeCatalog = () => ({
  ok: defaultCatalogResult.ok,
  pluginCount: defaultCatalog.length,
  fingerprint: WORKBENCH_DEFAULT_FINGERPRINT,
});

export const summarizeWorkspace = (fixture: WorkbenchFixture): string => {
  const selected = fixture.selectedSignals.length;
  return `${fixture.tenantId}/${fixture.scenario}/${fixture.mode}/${selected}`;
};

export const normalizeCatalogFingerprint = (seedCount: number): string =>
  `${WORKBENCH_DEFAULT_FINGERPRINT}:${seedCount}`.slice(0, 160);

export const runCatalogSeedProbe = async (): Promise<readonly string[]> => {
  const outputs = await Promise.all(
    defaultCatalog.map((definition) => {
      const seed = {
        name: definition.name,
        kind: definition.kind as PluginKind,
        tags: definition.tags,
        dependencies: definition.dependencies,
        namespace: definition.namespace,
        version: [1, 0, 0],
        config: definition.config as Record<string, unknown>,
        runner: async () => ({
          ok: true,
          value: {
            tenantId: String(definition.namespace),
            stage: definition.kind,
            generatedAtTag: `probe:${definition.id}`,
            route: ['probe'],
            topology: normalizeWorkbenchTopology({
              tenantId: definition.namespace,
              nodes: [],
              edges: [],
            }),
          },
          generatedAt: new Date().toISOString(),
        }),
      } satisfies PluginCatalogSeed;

      return runCatalogSeedSafe(seed).then((result) => `${definition.id}:${result.ok ? 'ok' : 'fail'}`);
    }),
  );
  return outputs;
};
