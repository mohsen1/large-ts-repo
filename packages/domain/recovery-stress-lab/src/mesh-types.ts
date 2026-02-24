import { ReadonlyDeep } from '@shared/core';
import { buildMinutes, addMinutes, toRfc3339 } from '@shared/util';
import { RecoverySignal, CommandRunbook, RecoverySignalId, WorkloadTopology, TenantId, WorkloadId, createTenantId } from './models';
import { normalizeTopology } from './topology-intelligence';

export interface MeshRunbookSlice {
  readonly runbookId: CommandRunbook['id'];
  readonly signalIds: readonly RecoverySignalId[];
  readonly intensity: number;
  readonly expectedMinutes: number;
  readonly createdAt: string;
}

export interface MeshNode {
  readonly workloadId: TenantId;
  readonly topology: WorkloadTopology;
  readonly slice: MeshRunbookSlice[];
}

export interface MeshRoute {
  readonly routeId: string;
  readonly nodeId: string;
  readonly title: string;
  readonly nodes: readonly string[];
  readonly load: number;
  readonly tags: Readonly<Record<string, string>>;
}

export interface MeshSegment {
  readonly path: readonly string[];
  readonly hops: number;
  readonly score: number;
  readonly signalAffinity: number;
  readonly runbookCount: number;
}

export interface MeshBlueprint {
  readonly tenantId: string;
  readonly routes: readonly MeshRoute[];
  readonly segments: readonly MeshSegment[];
  readonly risk: number;
  readonly createdAt: string;
}

export interface MeshEnvelope {
  readonly tenantId: string;
  readonly nodeCount: number;
  readonly activeSignals: readonly RecoverySignal['id'][];
  readonly mesh: readonly MeshNode[];
  readonly createdAt: string;
  readonly revision: number;
}

export interface MeshRanking {
  readonly routeId: MeshRoute['routeId'];
  readonly score: number;
  readonly rank: number;
  readonly loadDelta: number;
  readonly reasons: readonly string[];
}

export type MeshRevision = ReadonlyDeep<MeshEnvelope>;

export type SignalAffinity = Record<RecoverySignal['class'], number>;

const NODE_DIVIDER = 11_000;

export const calculateSignalAffinity = (signals: readonly RecoverySignal[]): SignalAffinity => {
  const affinity: SignalAffinity = {
    availability: 0,
    integrity: 0,
    performance: 0,
    compliance: 0,
  };

  for (const signal of signals) {
    const classValue = signal.class;
    if (classValue in affinity) {
      const severityFactor = signal.severity === 'critical' ? 4 : signal.severity === 'high' ? 3 : signal.severity === 'medium' ? 2 : 1;
      const metadataBias = Object.keys(signal.metadata).length;
      affinity[classValue] += severityFactor * (1 + Math.min(2, metadataBias / 4));
    }
  }

  return affinity;
};

export const buildMeshRoute = (routeId: string, nodes: readonly string[], score: number): MeshRoute => {
  return {
    routeId,
    nodeId: routeId.split('::')[0] ?? routeId,
    title: `route-${routeId}`,
    nodes,
    load: Math.max(0, score),
    tags: {
      nodes: String(nodes.length),
      created: toRfc3339(new Date()),
    },
  };
};

export const segmentRoute = (
  routeIndex: number,
  nodes: readonly string[],
  runbookCount: number,
  affinity: SignalAffinity,
): MeshSegment => {
  const sumAffinity = Object.values(affinity).reduce((acc, value) => acc + value, 0);
  const signalAffinity = Math.max(0, Number((sumAffinity / (Object.keys(affinity).length || 1)).toFixed(4)));
  const score = (nodes.length * 3 + runbookCount) * (1 + signalAffinity);
  return {
    path: [...nodes],
    hops: nodes.length,
    score,
    signalAffinity,
    runbookCount,
  };
};

export const routeSignature = (segment: MeshSegment): string => {
  const [head] = segment.path;
  const tail = segment.path[segment.path.length - 1];
  return `${head ?? 'root'}→${tail ?? 'leaf'}:${segment.hops}:${segment.score.toFixed(2)}`;
};

export const buildMeshNode = (topology: WorkloadTopology, runbooks: readonly CommandRunbook[]): MeshNode => {
  const normalized = normalizeTopology(topology);
  const byNode = new Map<WorkloadId, MeshRunbookSlice[]>();

  for (const runbook of runbooks) {
    const slice: MeshRunbookSlice = {
      runbookId: runbook.id,
      signalIds: runbook.steps.flatMap((step) => step.requiredSignals),
      intensity: runbook.steps.reduce((acc, step) => acc + step.estimatedMinutes * (1 + step.prerequisites.length), 0),
      expectedMinutes: runbook.steps.reduce((acc, step) => acc + step.estimatedMinutes, 0),
      createdAt: toRfc3339(new Date()),
    };

    const key = runbook.id as unknown as WorkloadId;
    byNode.set(key, [...(byNode.get(key) ?? []), slice]);
  }

  const topologyNodes = [...normalized.nodes].map((node) => ({
    workloadId: normalized.tenantId,
    topology: {
      tenantId: normalized.tenantId,
      nodes: normalized.nodes,
      edges: normalized.edges,
    },
    slice: byNode.get(node.id) ?? [],
  }));

  return {
    workloadId: normalized.tenantId,
    topology: {
      tenantId: normalized.tenantId,
      nodes: normalized.nodes,
      edges: normalized.edges,
    },
    slice: topologyNodes.flatMap((node) => node.slice),
  };
};

export const buildMeshBlueprint = (
  tenantId: string,
  topology: WorkloadTopology,
  runbooks: readonly CommandRunbook[],
  signals: readonly RecoverySignal[],
): MeshBlueprint => {
  const affinity = calculateSignalAffinity(signals);
  const normalized = normalizeTopology(topology);
  const routes: MeshRoute[] = normalized.nodes.map((node, index) => {
    const nodes = normalized.edges
      .filter((edge) => edge.from === node.id)
      .map((edge) => edge.to);
    const score = (nodes.length + 1) * (index + 1);
    return buildMeshRoute(`${tenantId}::${String(node.id)}`, [String(node.id), ...nodes], score);
  });
  const selectedRunbooks = runbooks.slice(0, Math.max(1, Math.min(8, runbooks.length)));
  const segments = selectedRunbooks.map((runbook, index) =>
    segmentRoute(index, [String(runbook.id), ...runbook.steps.map((step) => String(step.commandId))], selectedRunbooks.length, affinity),
  );
  const routeScore = segments.reduce((acc, segment) => acc + segment.score, 0);
  const risk = (routeScore / (segments.length || 1)) / NODE_DIVIDER;

  return {
    tenantId,
    routes,
    segments,
    risk,
    createdAt: toRfc3339(new Date()),
  };
};

export const rankMeshRoutes = (routes: readonly MeshRoute[]): readonly MeshRanking[] => {
  const ranked = routes
    .slice()
    .sort((left, right) => right.load - left.load)
    .map((route, index) => ({
      routeId: route.routeId,
      score: route.load,
      rank: index + 1,
      loadDelta: route.load - (routes[index - 1]?.load ?? 0),
      reasons: [
        `nodes=${route.nodes.length}`,
        `load=${route.load}`,
        `created=${route.tags.created}`,
      ],
    }));

  return ranked;
};

export const snapshotMesh = (
  tenantId: string,
  topology: WorkloadTopology,
  runbooks: readonly CommandRunbook[],
  signals: readonly RecoverySignal[],
): MeshEnvelope => {
  const normalized = normalizeTopology(topology);
  const end = addMinutes(new Date(), Math.max(1, normalized.nodes.length * 10 + signals.length * 2));
  const windows = buildMinutes(new Date(), end);
  const checkpoints = windows.map((window) => window * 60_000);
  const mesh = {
    workloadId: createTenantId(tenantId),
    topology: normalized,
    slice: [],
  };

  return {
    tenantId,
    nodeCount: normalized.nodes.length,
    activeSignals: signals.map((signal) => signal.id),
    mesh: [mesh],
    createdAt: toRfc3339(new Date()),
    revision: checkpoints.length,
  };
};

export const timelineMarker = (at: Date, band: number): string[] => {
  return buildMinutes(at, addMinutes(at, band)).map((window) => toRfc3339(new Date(window * 60_000)));
};

export const expandTopologyWindow = (
  anchor: Date,
  minutes: number,
): readonly string[] => {
  const windows = buildMinutes(anchor, addMinutes(anchor, minutes));
  const expanded = windows
    .map((window) => addMinutes(new Date(window * 60_000), 15).getTime())
    .filter((tick, index) => index % 2 === 0)
    .map((tick) => toRfc3339(new Date(tick)));
  return expanded;
};
