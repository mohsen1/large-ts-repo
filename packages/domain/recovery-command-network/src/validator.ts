import type { CommandNetworkSnapshot, CommandNetworkNode, CommandNetworkEdge, RoutingDecision, RuntimeIntent } from './types';
import { computeEdgeHealth, computePolicyPressure } from './insights';

export interface ValidationIssue {
  readonly code: 'edge_invalid' | 'policy_violation' | 'run_mismatch' | 'node_unreachable';
  readonly message: string;
  readonly target?: string;
}

export interface ValidationReport {
  readonly snapshotId: string;
  readonly ok: boolean;
  readonly issues: readonly ValidationIssue[];
  readonly score: number;
}

const mapByNodeId = (snapshot: CommandNetworkSnapshot) => {
  const map = new Map<string, CommandNetworkNode>();
  for (const node of snapshot.nodes) {
    map.set(node.nodeId, node);
  }
  return map;
};

const edgeTargetExists = (snapshot: CommandNetworkSnapshot, edge: CommandNetworkEdge): boolean => mapByNodeId(snapshot).has(edge.to);

const isPolicySane = (snapshot: CommandNetworkSnapshot, edge: CommandNetworkEdge): boolean => {
  const policyIds = new Set(snapshot.policies.map((policy) => policy.policyId));
  return edge.constraints.every((constraint) => {
    const policyId = constraint.split(':')[0];
    return policyIds.has(policyId as never) || constraint.includes('default');
  });
};

export const validateSnapshot = (snapshot: CommandNetworkSnapshot): ValidationReport => {
  const issues: ValidationIssue[] = [];
  const nodeMap = mapByNodeId(snapshot);

  for (const edge of snapshot.edges) {
    if (!nodeMap.has(edge.from)) {
      issues.push({
        code: 'node_unreachable',
        message: `edge source missing: ${edge.from}`,
        target: edge.from,
      });
    }

    if (!edgeTargetExists(snapshot, edge)) {
      issues.push({
        code: 'edge_invalid',
        message: `edge target missing: ${edge.to}`,
        target: edge.to,
      });
    }

    if (!isPolicySane(snapshot, edge)) {
      issues.push({
        code: 'policy_violation',
        message: `edge constraints reference missing policy: ${edge.edgeId}`,
        target: edge.edgeId,
      });
    }
  }

  const policyPressure = computePolicyPressure(snapshot.policies);
  if (policyPressure > 1.2) {
    issues.push({
      code: 'policy_violation',
      message: 'policy pressure too high',
      target: snapshot.networkId,
    });
  }

  const health = computeEdgeHealth(snapshot.edges);
  if (health.healthyRatio < 0.75) {
    issues.push({
      code: 'edge_invalid',
      message: `edge health ratio too low: ${health.healthyRatio}`,
      target: snapshot.networkId,
    });
  }

  return {
    snapshotId: snapshot.networkId,
    ok: issues.length === 0,
    issues,
    score: Number(Math.max(0, 1 - issues.length * 0.08).toFixed(3)),
  };
};

export const validateRuntimeIntents = (snapshot: CommandNetworkSnapshot, intents: readonly RuntimeIntent[]): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const nodeMap = mapByNodeId(snapshot);

  if (!snapshot.activeRunbookExecution) {
    issues.push({
      code: 'run_mismatch',
      message: 'snapshot missing active runbook execution',
      target: snapshot.networkId,
    });
  }

  for (const intent of intents) {
    for (const wave of intent.waves) {
      for (const nodeId of wave.nodeIds) {
        if (!nodeMap.has(nodeId)) {
          issues.push({
            code: 'node_unreachable',
            message: `intent ${intent.intentId} includes missing node ${nodeId}`,
            target: nodeId,
          });
        }
      }
    }

    if (snapshot.policies.length === 0) {
      issues.push({
        code: 'policy_violation',
        message: `intent ${intent.intentId} has no policies`,
        target: intent.intentId,
      });
    }
  }

  return issues;
};

export const summarizeDecisions = (decisions: readonly RoutingDecision[]) => {
  const byPolicy = new Map<string, number>();
  for (const decision of decisions) {
    byPolicy.set(decision.policyId, (byPolicy.get(decision.policyId) ?? 0) + (decision.accepted ? 1 : 0));
  }

  const rows = [...byPolicy.entries()].map(([policyId, accepted]) => ({
    policyId,
    accepted,
    score: Number((accepted / Math.max(1, decisions.length)).toFixed(3)),
  }));

  const acceptedCount = decisions.filter((entry) => entry.accepted).length;
  return {
    total: decisions.length,
    acceptedCount,
    rejectCount: decisions.length - acceptedCount,
    byPolicy: rows,
  };
};
