import type { CommandNetworkSnapshot, RuntimeIntent, CommandPolicy, CommandGraph, RoutingDecision, CommandWave, PolicyRule } from '@domain/recovery-command-network';
import { runMeshPipeline, validateRuntimeIntents, summarizeDecisions } from '@domain/recovery-command-network';

export interface NetworkWorkspaceAdapter {
  readonly planCount: number;
  readonly graphSummary: string;
  readonly routingCount: number;
  readonly routeSummary: string;
}

export interface AdaptedSignal {
  readonly nodeId: string;
  readonly reason: string;
  readonly accepted: boolean;
  readonly score: number;
}

const formatNodeCount = (snapshot: CommandNetworkSnapshot | null) => {
  if (!snapshot) {
    return 'no snapshot';
  }
  return `${snapshot.nodes.length} nodes, ${snapshot.edges.length} edges`;
};

const formatWaveProfile = (waves: readonly CommandWave[]) => {
  if (waves.length === 0) {
    return 'no waves';
  }

  const totalCommands = waves.reduce((sum, wave) => sum + wave.commandCount, 0);
  return `${waves.length} waves (${totalCommands} commands)`;
};

export const summarizeGraph = (graph: CommandGraph | null): string => {
  if (!graph) {
    return 'empty graph';
  }
  const activePolicies = graph.activePolicyIds.length;
  const allNodeCounts = Object.entries(graph.nodesByRole).flatMap(([, nodes]) => nodes).length;
  return `${allNodeCounts} nodes across ${activePolicies} policies`;
};

export const adaptWorkspace = (snapshot: CommandNetworkSnapshot, plans: readonly RuntimeIntent[]): NetworkWorkspaceAdapter => {
  const policyCount = snapshot.policies.length;
  const pipeline = runMeshPipeline(snapshot, plans);
  const validated = validateRuntimeIntents(snapshot, plans);

  return {
    planCount: plans.length,
    graphSummary: `${formatNodeCount(snapshot)}; ${formatWaveProfile(plans[0]?.waves ?? [])}`,
    routingCount: pipeline.decisions.length,
    routeSummary: `${pipeline.decisions.length} routed (${validated.length} validations)`,
  };
};

export const toSignals = (decisions: readonly RoutingDecision[]): readonly AdaptedSignal[] =>
  decisions.map((decision, index) => ({
    nodeId: decision.nodeId,
    reason: `${index + 1}. ${decision.reason}`,
    accepted: decision.accepted,
    score: decision.score,
  }));

export const summarizePolicyNames = (policies: readonly PolicyRule[]) =>
  policies.map((policy) => `${policy.name} (${policy.windowHours}h policy)`).join('; ');

export const computeDecisionRate = (decisions: readonly RoutingDecision[]) => summarizeDecisions(decisions);
