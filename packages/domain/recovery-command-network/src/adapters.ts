import type { CommandNetworkSnapshot, CommandNetworkNode, CommandNetworkEdge, RuntimeIntent, SignalEnvelope, CommandNetworkNodeId, CommandGraph, CommandPolicy, DriftObservation } from './types';
import { validateSnapshot } from './validator';

export interface ReadinessAdapters {
  readonly transformNodeLabel: (node: CommandNetworkNode) => string;
  readonly summarizeLatency: (edge: CommandNetworkEdge) => string;
}

export const createAdapters = (): ReadinessAdapters => ({
  transformNodeLabel: (node) => `${node.role.toUpperCase()} ${node.label}`,
  summarizeLatency: (edge) => `${edge.meta.protocol} ${edge.meta.latencyMsP95}ms`,
});

export const toSignalEnvelope = <TPayload>(payload: TPayload, sourceNode: CommandNetworkNodeId): SignalEnvelope<TPayload> => ({
  envelopeId: `signal-${sourceNode}-${Date.now()}` as any,
  sourceNode,
  emittedAt: new Date().toISOString(),
  payload,
  confidence: 0.9,
  tags: ['recovery', 'command-network'],
});

export const enrichDriftFeed = (snapshot: CommandNetworkSnapshot): DriftObservation[] => {
  const report = validateSnapshot(snapshot);
  const reportScore = report.score;
  return report.issues.map((issue) => ({
    at: new Date().toISOString(),
    drift: reportScore < 0.7 ? 'degrading' : 'neutral',
    scoreDelta: Number((reportScore - 0.5).toFixed(3)),
    policyId: snapshot.policies[0]?.policyId ?? ('default-policy' as any),
    reason: `${issue.code}: ${issue.message}`,
  }));
};

export const toGraph = (snapshot: CommandNetworkSnapshot): CommandGraph => {
  const nodesByRole = snapshot.nodes.reduce((acc, node) => {
    const bucket = acc[node.role] ?? [];
    return {
      ...acc,
      [node.role]: [...bucket, node.nodeId],
    };
  }, {
    ingest: [] as CommandNetworkNodeId[],
    plan: [] as CommandNetworkNodeId[],
    simulate: [] as CommandNetworkNodeId[],
    execute: [] as CommandNetworkNodeId[],
    audit: [] as CommandNetworkNodeId[],
  });

  const adjacency = snapshot.nodes.reduce((acc, node) => {
    const edges = snapshot.edges.filter((edge) => edge.from === node.nodeId);
    return {
      ...acc,
      [node.nodeId]: edges,
    } as Record<CommandNetworkNodeId, readonly CommandNetworkEdge[]>;
  }, {} as Record<CommandNetworkNodeId, readonly CommandNetworkEdge[]>);

  return {
    networkId: snapshot.networkId,
    nodesByRole,
    adjacency,
    activePolicyIds: snapshot.policies.map((policy) => policy.policyId),
  };
};

export const mergeIntents = (left: readonly RuntimeIntent[], right: readonly RuntimeIntent[]): RuntimeIntent[] => {
  const map = new Map<string, RuntimeIntent>();
  for (const run of [...left, ...right]) {
    map.set(run.intentId, run);
  }

  return [...map.values()];
};
