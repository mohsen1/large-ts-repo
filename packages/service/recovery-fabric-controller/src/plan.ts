import { ok, fail, type Result } from '@shared/result';

import { calculateRecoveryWindowMinutes, topologicalOrder } from '@domain/recovery-orchestration';
import {
  type FabricAllocation,
  type FabricCandidate,
  type FabricPlanId,
  type FabricRunId,
  type FabricScenario,
  buildTopologySnapshot,
  summarizeTopology,
  evaluateCandidatePolicy,
  estimateWindowCoverage,
  buildCadence,
  isWindowExpired,
  nextWindowSlot,
  type FabricTrace,
} from '@domain/recovery-fabric-models';
import { FabricCommandInput } from './types';

export interface FabricPlanDraft {
  readonly planId: FabricPlanId;
  readonly runId: FabricRunId;
  readonly candidate: FabricCandidate;
  readonly scenario: FabricScenario;
  readonly allocation: FabricAllocation;
  readonly estimatedMinutes: number;
  readonly score: number;
}

export interface FabricPlanValidation {
  readonly draft: FabricPlanDraft;
  readonly policyAllowed: boolean;
  readonly reasons: readonly string[];
}

const validateCandidateWindow = (scenario: FabricScenario) => {
  const closed = isWindowExpired(scenario.window);
  if (closed) {
    return { allowed: false, reasons: ['window-expired'] as const };
  }

  const cadence = buildCadence(scenario.window, 15);
  if (cadence.length === 0) {
    return { allowed: false, reasons: ['window-empty'] as const };
  }

  const open = nextWindowSlot(scenario.window);
  if (!open) {
    return { allowed: false, reasons: ['window-no-open-slot'] as const };
  }

  return {
    allowed: true,
    reasons: [`next-slot-${open}`, `coverage-${estimateWindowCoverage(scenario.window)}`] as const,
  };
};

const estimateRecoveryMinutes = (scenario: FabricScenario, candidate: FabricCandidate): number => {
  const programWindow = calculateRecoveryWindowMinutes({
    id: scenario.id as never,
    tenant: scenario.tenantId as never,
    service: scenario.routes[0]?.sourceNode as never,
    name: scenario.id,
    description: scenario.objective.name,
    priority: 'bronze',
    mode: 'restorative',
    window: scenario.window,
    topology: {
      rootServices: candidate.planNodeIds.slice(0, Math.max(1, candidate.planNodeIds.length)),
      fallbackServices: candidate.planNodeIds.slice(0, Math.max(0, candidate.planNodeIds.length - 1)),
      immutableDependencies: [],
    },
    constraints: [],
    steps: candidate.planNodeIds.map((nodeId) => ({
      id: String(nodeId),
      title: `candidate-${nodeId}`,
      command: `rehydrate-${nodeId}`,
      timeoutMs: 10_000,
      dependencies: candidate.planNodeIds.slice(0, 1),
      requiredApprovals: 1,
      tags: ['auto-generated'],
    })),
    owner: 'fabric-controller',
    tags: ['fabric'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as never);

  const baseline = Math.max(1, candidate.planNodeIds.length * 3);
  const candidateTopology = topologicalOrder({
    id: scenario.id as never,
    tenant: scenario.tenantId as never,
    service: candidate.planNodeIds[0] as never,
    name: scenario.id,
    description: scenario.objective.name,
    priority: 'bronze',
    mode: 'restorative',
    window: scenario.window,
    topology: {
      rootServices: candidate.planNodeIds,
      fallbackServices: candidate.planNodeIds,
      immutableDependencies: candidate.routeIds.map((routeId) => [routeId, routeId]),
    },
    constraints: [],
    steps: candidate.planNodeIds.map((nodeId, index) => ({
      id: String(nodeId),
      title: `step-${nodeId}`,
      command: `execute-${index}`,
      timeoutMs: 5_000,
      dependencies: index > 0 ? [String(candidate.planNodeIds[index - 1])] : [],
      requiredApprovals: 1,
      tags: ['topological'],
    })),
    owner: 'fabric-controller',
    tags: ['fabric'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as never);

  const multiplier = candidateTopology.length > 0 ? 1 + candidateTopology.length / 12 : 1;
  const topologySummary = summarizeTopology(scenario.nodes, scenario.links);
  return Math.max(1, Math.ceil((programWindow + baseline) * multiplier + topologySummary.averageLatencyMs / 1000));
};

export const preparePlanDraft = (input: FabricCommandInput): Result<FabricPlanDraft, Error> => {
  const { scenario, candidate, runId, allocation, planId } = input;
  const window = validateCandidateWindow(scenario);
  if (!window.allowed) {
    return fail(new Error(window.reasons.join(',')));
  }

  const topology = buildTopologySnapshot(scenario.nodes, scenario.links);
  if (topology.nodes.length === 0 || topology.edges.length === 0) {
    return fail(new Error('topology-incomplete'));
  }

  const summary = summarizeTopology(scenario.nodes, scenario.links);
  const policy = evaluateCandidatePolicy(candidate, scenario, runId);
  if (!policy.allowed) {
    return fail(new Error(policy.reason));
  }

  const estimatedMinutes = estimateRecoveryMinutes(scenario, candidate);
  const score = Math.max(0, 1 - candidate.planNodeIds.length / Math.max(1, scenario.nodes.length));

  return ok({
    planId,
    runId,
    candidate,
    scenario,
    allocation,
    estimatedMinutes: estimatedMinutes + summary.averageLatencyMs,
    score: Number((score + summary.averageLatencyMs / 1000).toFixed(3)),
  });
};

export const validatePlanDraft = (draft: FabricPlanDraft): FabricPlanValidation => {
  const policyResult = evaluateCandidatePolicy(draft.candidate, draft.scenario, draft.runId);
  const reasons = [
    `score-${draft.score.toFixed(2)}`,
    `estimate-${draft.estimatedMinutes}`,
    policyResult.allowed ? 'policy-ok' : 'policy-blocked',
  ];
  return {
    draft,
    policyAllowed: policyResult.allowed,
    reasons,
  };
};

export const buildFabricTrace = (draft: FabricPlanDraft): FabricTrace => {
  return {
    runId: draft.runId,
    planId: draft.planId,
    startedAt: new Date().toISOString(),
    status: 'running',
    currentNodeId: draft.allocation.allocatedNodeIds[0],
  };
};
