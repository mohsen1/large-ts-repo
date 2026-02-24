import { type TenantId, type WorkloadTopology, type WorkloadTopologyEdge, type WorkloadTopologyNode } from './models';
import { type NoInfer } from '@shared/type-level';

export type FingerprintSlot = `${TenantId}:${string}`;
export type SlotMap = Readonly<Record<string, FingerprintSlot>>;

export interface FingerprintInput {
  readonly topology: WorkloadTopology;
  readonly salt: string;
}

export interface TopologyFingerprint {
  readonly tenantId: TenantId;
  readonly nodeDigest: string;
  readonly edgeDigest: string;
  readonly fullDigest: string;
  readonly window: string;
}

export interface TopologyStats {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly criticalitySum: number;
  readonly activeCount: number;
}

const splitNodes = (nodes: readonly WorkloadTopologyNode[]): readonly WorkloadTopologyNode[] =>
  nodes.toSorted((left, right) => left.id.localeCompare(right.id));

const splitEdges = (edges: readonly WorkloadTopologyEdge[]): readonly WorkloadTopologyEdge[] =>
  edges.toSorted((left, right) => `${left.from}->${left.to}`.localeCompare(`${right.from}->${right.to}`));

const buildHash = (value: string, salt: string): string => {
  let hash = 2166136261;
  const combined = `${salt}::${value}`;
  for (let index = 0; index < combined.length; index += 1) {
    hash ^= combined.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16);
};

const describeNode = (node: WorkloadTopologyNode): string => `${node.id}:${node.name}:${node.ownerTeam}:${node.criticality}:${node.active}`;
const describeEdge = (edge: WorkloadTopologyEdge): string => `${edge.from}->${edge.to}:${edge.coupling}:${edge.reason}`;

export const fingerprintTopology = <TTopology extends WorkloadTopology>(topology: NoInfer<TTopology>): TopologyFingerprint => {
  const nodes = splitNodes(topology.nodes);
  const edges = splitEdges(topology.edges);
  const nodeDigest = nodes.map(describeNode).join('|');
  const edgeDigest = edges.map(describeEdge).join('|');
  const fullDigest = `${nodeDigest}##${edgeDigest}`;
  const window = `${topology.nodes.length}:${topology.edges.length}`;
  return {
    tenantId: topology.tenantId,
    nodeDigest,
    edgeDigest,
    fullDigest: buildHash(fullDigest, topology.tenantId),
    window,
  };
};

export const buildTopologyStats = <TTopology extends WorkloadTopology>(topology: NoInfer<TTopology>): TopologyStats => {
  const activeCount = topology.nodes.filter((node) => node.active).length;
  const criticalitySum = topology.nodes.reduce((acc, node) => acc + node.criticality, 0);
  return {
    nodeCount: topology.nodes.length,
    edgeCount: topology.edges.length,
    criticalitySum,
    activeCount,
  };
};

export const buildFingerprintIndex = <TTopology extends WorkloadTopology>(
  topologies: NoInfer<readonly TTopology[]>,
): SlotMap => {
  const entries = topologies.map((topology) => {
    const fp = fingerprintTopology(topology);
    return [topology.tenantId, `${topology.tenantId}:${fp.fullDigest}`] as const;
  });

  return Object.fromEntries(entries) as SlotMap;
};

export const mergeFingerprints = (
  current: TopologyFingerprint,
  incoming: TopologyFingerprint,
): TopologyFingerprint => {
  const window = `${current.window}+${incoming.window}`;
  const nodeDigest = `${current.nodeDigest}|${incoming.nodeDigest}`;
  const edgeDigest = `${current.edgeDigest}|${incoming.edgeDigest}`;
  const fullDigest = buildHash(`${nodeDigest}::${edgeDigest}`, `${current.tenantId}`);
  return {
    tenantId: current.tenantId,
    nodeDigest,
    edgeDigest,
    fullDigest,
    window,
  };
};

export type DriftRecord<TTopology extends WorkloadTopology> = {
  readonly topology: TTopology;
  readonly hash: string;
  readonly delta: number;
};

export const computeTopologyDrift = <TTopology extends WorkloadTopology>(
  previous: TTopology,
  next: TTopology,
): DriftRecord<TTopology> => {
  const previousFingerprint = fingerprintTopology(previous);
  const nextFingerprint = fingerprintTopology(next);
  const previousSize = previousFingerprint.fullDigest.length;
  const nextSize = nextFingerprint.fullDigest.length;
  return {
    topology: next,
    hash: nextFingerprint.fullDigest,
    delta: Number(((nextSize - previousSize) / previousSize).toFixed(4)),
  };
};
