import { computeEdgeHealth, computePolicyPressure } from './insights';
import { computeRoleCounts, validateGraphStructure } from './topology';
import { validateSnapshot, validateRuntimeIntents } from './validator';
import type {
  CommandNetworkSnapshot,
  RuntimeIntent,
  RoutingDecision,
  SignalEnvelope,
  DriftObservation,
  CommandGraph,
  CommandNetworkNode,
  CommandPolicy,
  CommandNetworkEdge,
  CommandNetworkNodeId,
  CommandPolicyId,
} from './types';

export interface MeshOrchestratorConfig {
  readonly allowCrossTenant: boolean;
  readonly maxDriftPerWindow: number;
  readonly targetWindowSeconds: number;
  readonly driftMultiplier: number;
}

export interface MeshPipelineResult {
  readonly startedAt: string;
  readonly completedAt: string;
  readonly graph: CommandGraph;
  readonly decisions: readonly RoutingDecision[];
  readonly envelope: SignalEnvelope<Record<string, unknown>>;
  readonly warnings: readonly string[];
}

export interface MeshHealth {
  readonly score: number;
  readonly decisionRate: number;
  readonly edgeHealth: number;
  readonly policyPressure: number;
}

const buildGraph = (snapshot: CommandNetworkSnapshot): CommandGraph => ({
  networkId: snapshot.networkId,
  nodesByRole: {
    ingest: snapshot.nodes.filter((node: CommandNetworkNode) => node.role === 'ingest').map((node) => node.nodeId),
    plan: snapshot.nodes.filter((node: CommandNetworkNode) => node.role === 'plan').map((node) => node.nodeId),
    simulate: snapshot.nodes.filter((node: CommandNetworkNode) => node.role === 'simulate').map((node) => node.nodeId),
    execute: snapshot.nodes.filter((node: CommandNetworkNode) => node.role === 'execute').map((node) => node.nodeId),
    audit: snapshot.nodes.filter((node: CommandNetworkNode) => node.role === 'audit').map((node) => node.nodeId),
  },
  adjacency: snapshot.nodes.reduce((acc, node) => {
    acc[node.nodeId] = snapshot.edges.filter((edge) => edge.from === node.nodeId);
    return acc;
  }, {} as Record<string, CommandNetworkEdge[]>) as CommandGraph['adjacency'],
  activePolicyIds: snapshot.policies.map((policy) => policy.policyId),
});

export const createDefaultPipeline = (): MeshOrchestratorConfig => ({
  allowCrossTenant: false,
  maxDriftPerWindow: 0.16,
  targetWindowSeconds: 420,
  driftMultiplier: 1.2,
});

export const scoreNodeBalance = (snapshot: CommandNetworkSnapshot): number => {
  const counts = computeRoleCounts(snapshot.nodes);
  const weights: Record<string, number> = {
    ingest: 1,
    plan: 0.8,
    simulate: 0.95,
    execute: 1.2,
    audit: 0.7,
  };

  const totalNodes = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const weighted = Object.entries(counts).reduce((sum, [role, count]) => sum + (count / Math.max(1, totalNodes)) * weights[role], 0);
  const policyPressure = computePolicyPressure(snapshot.policies);
  return Number((weighted * (1 + policyPressure / 2)).toFixed(3));
};

export const evaluateDrift = (snapshot: CommandNetworkSnapshot, run: Readonly<RuntimeIntent>): DriftObservation[] => {
  const now = Date.now();
  const policyPressure = scoreNodeBalance(snapshot);
  const drift: DriftObservation[] = [];

  for (let index = 0; index < snapshot.policies.length; index += 1) {
    const policy = snapshot.policies[index];
    const base = 0.1 + index * 0.07;
    const pressure = base * (run.priority === 'critical' ? 1.4 : 1);
    drift.push({
      at: new Date(now + index * 10_000).toISOString(),
      drift: pressure > 0.4 ? 'degrading' : pressure > 0.2 ? 'neutral' : 'improving',
      scoreDelta: Number((pressure - policyPressure).toFixed(3)),
      policyId: policy.policyId,
      reason: `policy ${policy.name} pressure=${pressure.toFixed(2)} config=${run.priority}`,
    });
  }

  return drift;
};

export const validatePolicy = (policyId: CommandPolicyId, policies: readonly CommandPolicyId[]): boolean =>
  policies.includes(policyId);

export const calculateMeshHealth = (snapshot: CommandNetworkSnapshot): MeshHealth => {
  const edgeHealth = computeEdgeHealth(snapshot.edges);
  const policyPressure = computePolicyPressure(snapshot.policies);
  const score = (1 - (1 - edgeHealth.healthyRatio) * 0.5) * Math.max(0, 1 - policyPressure / 2);

  return {
    score,
    decisionRate: Math.max(0, Math.min(1, score * 100)),
    edgeHealth: edgeHealth.healthyRatio,
    policyPressure,
  };
};

export const runMeshPipeline = (snapshot: CommandNetworkSnapshot, intents: readonly RuntimeIntent[]): MeshPipelineResult => {
  const start = new Date().toISOString();
  const graph = buildGraph(snapshot);
  const topology = validateGraphStructure(graph);
  const snapshotValidation = validateSnapshot(snapshot);
  const warnings: string[] = [...topology.errors, ...snapshotValidation.issues.map((entry) => entry.message)];
  const decisions: RoutingDecision[] = [];

  for (const run of intents) {
    const drifts = evaluateDrift(snapshot, run);
    const driftScore = drifts.reduce((sum, entry) => sum + entry.scoreDelta, 0);

    if (driftScore > 1.5) {
      warnings.push(`run ${run.intentId} exceeds drift threshold`);
    }

    const driftPenalty = validateRuntimeIntents(snapshot, [run]).length;
    const accepted = snapshotValidation.ok && driftPenalty === 0 && driftScore < 1;

    for (const wave of run.waves) {
      for (const nodeId of wave.nodeIds) {
        const policyId = snapshot.policies[0]?.policyId ?? ('none' as CommandPolicyId);
        const reason = `wave-${wave.waveIndex} priority=${run.priority} policy=${policyId}`;
        decisions.push({
          nodeId,
          policyId,
          accepted,
          reason,
          score: Math.max(0, Math.min(100, 100 - driftScore * 25 - driftPenalty * 10)),
        });
      }
    }
  }

  const window = createDefaultPipeline();
  const health = calculateMeshHealth(snapshot);
  const envelope: SignalEnvelope<Record<string, unknown>> = {
    envelopeId: `${snapshot.networkId}-pipeline-${start}` as unknown as SignalEnvelope<Record<string, unknown>>['envelopeId'],
    sourceNode: snapshot.nodes[0]?.nodeId ?? ('none' as CommandNetworkNodeId),
    emittedAt: new Date(Date.now() + window.targetWindowSeconds * 1000).toISOString(),
    payload: {
      policies: snapshot.policies.length,
      decisions: decisions.length,
      health,
      warnings,
    },
    confidence: Math.max(0.4, Math.min(1, health.score)),
    tags: ['mesh', 'orchestration'],
  };

  return {
    startedAt: start,
    completedAt: envelope.emittedAt,
    graph,
    decisions,
    envelope,
    warnings,
  };
};
