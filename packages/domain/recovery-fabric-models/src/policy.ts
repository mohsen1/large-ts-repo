import type { FabricConstraint, FabricCandidate, FabricRunId, FabricScenario, FabricTrace } from './types';

export interface FabricPolicyResult {
  readonly allowed: boolean;
  readonly reason: string;
  readonly blockingConstraints: readonly FabricConstraint[];
}

export interface PolicyViolation {
  readonly code: FabricConstraint['code'];
  readonly detail: string;
}

const constraintPriority = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
} as const;

export const evaluateCandidatePolicy = (
  candidate: FabricCandidate,
  scenario: FabricScenario,
  runContext: FabricRunId,
): FabricPolicyResult => {
  const missingNode = candidate.planNodeIds.some((nodeId) => !scenario.nodes.some((node) => node.id === nodeId));
  if (missingNode) {
    return {
      allowed: false,
      reason: `run ${runContext}: candidate references unknown nodes`,
      blockingConstraints: [
        {
          code: 'dependency',
          severity: 'critical',
          description: 'Candidate node missing from scenario',
        },
      ],
    };
  }

  const nodeCount = candidate.routeIds.length + candidate.planNodeIds.length;
  const criticalViolation =
    (scenario.objective.targetRtoMinutes < 1 && nodeCount > 8)
    || candidate.planNodeIds.length === 0
    || scenario.objective.maxConcurrentSteps < 1;

  if (criticalViolation) {
    return {
      allowed: false,
      reason: `run ${runContext}: objective requires tighter constraints`,
      blockingConstraints: [
        {
          code: 'rto',
          severity: 'high',
          description: 'Candidate violates RTO-related limits',
        },
      ],
    };
  }

  const riskScore = scoreCandidateRisk(candidate, scenario);
  if (riskScore >= 0.82) {
    return {
      allowed: false,
      reason: `run ${runContext}: risk score exceeds threshold`,
      blockingConstraints: [
        {
          code: 'compliance',
          severity: 'medium',
          description: 'Candidate policy risk profile is out of threshold',
        },
      ],
    };
  }

  return {
    allowed: true,
    reason: `run ${runContext}: candidate accepted`,
    blockingConstraints: [],
  };
};

export const rankPolicyViolations = (violations: readonly PolicyViolation[]): readonly PolicyViolation[] => {
  return [...violations].sort((left, right) => {
    const leftSeverity = severityRank(mapViolationCode(left.code));
    const rightSeverity = severityRank(mapViolationCode(right.code));
    return leftSeverity - rightSeverity;
  });
};

const severityRank = (priority: keyof typeof constraintPriority) => constraintPriority[priority];

const mapViolationCode = (code: string): keyof typeof constraintPriority => {
  if (code === 'rto') return 'critical';
  if (code === 'dependency') return 'high';
  if (code === 'compliance') return 'medium';
  return 'low';
};

const scoreCandidateRisk = (candidate: FabricCandidate, scenario: FabricScenario): number => {
  const nodePenalty = scenario.nodes.length === 0 ? 0 : candidate.planNodeIds.length / scenario.nodes.length;
  const routePenalty = scenario.routes.length === 0 ? 0 : candidate.routeIds.length / scenario.routes.length;
  const rationalePenalty = candidate.rationale.length / 120;
  const aggregate = nodePenalty * 0.45 + routePenalty * 0.35 + Math.min(1, rationalePenalty) * 0.2;
  return Number(Math.min(1, aggregate).toFixed(4));
};

export const buildTraceFromPolicy = (
  trace: FabricTrace,
  policies: readonly FabricPolicyResult[],
): FabricTrace => {
  const failed = policies.some((policy) => !policy.allowed);
  const blocking = policies.flatMap((policy) => policy.blockingConstraints).length;
  return {
    ...trace,
    status: failed ? 'suspended' : blocking > 0 ? 'running' : trace.status,
  };
};
