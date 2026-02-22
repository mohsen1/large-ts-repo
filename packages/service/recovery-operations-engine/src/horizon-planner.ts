import { withBrand } from '@shared/core';
import type { Brand } from '@shared/core';
import type {
  RunPlanSnapshot,
  RecoverySignal,
  RecoveryConstraintBudget,
  SessionDecision,
} from '@domain/recovery-operations-models';
import {
  buildDependencyMap,
  type DependencyMap,
  type DependencyNodeState,
  type ServiceDependencyNode,
  type DependencyRank,
} from '@domain/recovery-operations-models/dependency-map';
import {
  buildOrchestrationPlan,
  canRunPlan,
  prioritizeOrchestrationPlans,
  snapshotFromPlan,
  type OrchestrationPlan,
  type OrchestrationSnapshot,
} from '@domain/recovery-operations-models/simulation-orchestration';
import type { SessionQueryFilter } from '@data/recovery-operations-store';

const brandRunId = (input: string) => withBrand(input, 'RecoveryRunId');

export interface HorizonInput {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly candidatePlans: readonly RunPlanSnapshot[];
  readonly dependencyNodes: readonly ServiceDependencyNode[];
  readonly dependencyEdges: readonly { from: string; to: string; reliabilityScore: number; isHardDependency: boolean }[];
  readonly filter?: SessionQueryFilter;
}

export interface HorizonWindow {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly plans: readonly OrchestrationPlan[];
  readonly snapshots: readonly OrchestrationSnapshot[];
  readonly dependencyMap: DependencyMap;
  readonly selectedPlan?: OrchestrationPlan;
}

export interface CandidateDecision {
  readonly planId: string;
  readonly runnable: boolean;
  readonly reason: string;
  readonly snapshot: OrchestrationSnapshot;
}

const toDependencyMap = (tenant: Brand<string, 'TenantId'>, input: HorizonInput): DependencyMap => {
  return buildDependencyMap({
    tenant,
    services: input.dependencyNodes,
    edges: input.dependencyEdges.map((edge) => ({
      from: withBrand(edge.from, 'ServiceId'),
      to: withBrand(edge.to, 'ServiceId'),
      reliabilityScore: edge.reliabilityScore,
      isHardDependency: edge.isHardDependency,
    })),
    generatedAt: new Date().toISOString(),
  });
};

const mockSignals = (seed: number): readonly RecoverySignal[] =>
  Array.from({ length: 12 }, (_, index) => ({
    id: `${seed}-${index}`,
    source: `planner-${seed}`,
    severity: ((index + seed) % 10) + 1,
    confidence: ((index % 9) + 1) / 10,
    detectedAt: new Date(Date.now() - (index * 31_000)).toISOString(),
    details: { index, seed },
  }));

const inferBudget = (plan: RunPlanSnapshot, idx: number): RecoveryConstraintBudget => {
  if (plan.constraints?.maxParallelism) {
    return plan.constraints;
  }

  return {
    maxParallelism: Math.min(8, Math.max(1, plan.program.steps.length)),
    maxRetries: idx % 5,
    timeoutMinutes: Math.max(5, 10 + idx * 2),
    operatorApprovalRequired: idx % 3 === 0,
  };
};

const reasonForPlan = (plan: OrchestrationPlan, state: OrchestrationPlan['state']): string => {
  if (!canRunPlan(plan)) return 'Plan cannot execute due to constraints';
  if (state === 'ready') return 'Ready for execution';
  if (state === 'staging') return 'Pending validation';
  if (state === 'blocked') return 'Blocked by risk policy';
  if (state === 'simulating') return 'Simulation in flight';
  return 'Idle';
};

export const planHorizon = (input: HorizonInput): HorizonWindow => {
  const dependencyMap = toDependencyMap(input.tenant, input);
  const prioritized = prioritizeOrchestrationPlans(
    input.candidatePlans.map((candidate, idx) => {
      const budget = inferBudget(candidate, idx);
      return buildOrchestrationPlan(input.tenant, candidate, mockSignals(idx), [], budget);
    }),
  );

  const selected = prioritized.find((plan) => canRunPlan(plan));
  const snapshots = prioritized.map((plan) => snapshotFromPlan(plan));
  const decisions = computeDecisions(prioritized, selected);

  void decisions;

  return {
    tenant: input.tenant,
    plans: prioritized,
    snapshots,
    dependencyMap,
    selectedPlan: selected,
  };
};

const computeDecisions = (
  plans: readonly OrchestrationPlan[],
  selectedPlan?: OrchestrationPlan,
): readonly CandidateDecision[] => {
  return plans.map((plan) => {
    const state = plan.state;
    const snapshot = snapshotFromPlan(plan);
    return {
      planId: String(plan.candidate.id),
      runnable: canRunPlan(plan),
      reason: reasonForPlan(plan, state),
      snapshot,
    };
  }).sort((left, right) => Number(right.runnable) - Number(left.runnable));
};

export const buildHorizonReport = (horizon: HorizonWindow): string => {
  const selected = horizon.selectedPlan ? String(horizon.selectedPlan.candidate.id) : 'none';
  const nodes = horizon.dependencyMap.nodes.length;
  const edges = horizon.dependencyMap.edges.length;
  return `tenant=${horizon.tenant} selected=${selected} candidates=${horizon.plans.length} nodes=${nodes} edges=${edges} cycle=${horizon.dependencyMap.hasCycle}`;
};

export const buildDependencyState = (states: readonly DependencyNodeState[]): readonly DependencyRank[] => {
  return states
    .map((state) => ({
      nodeId: withBrand(`state-${state}`, 'ServiceId'),
      depth: state.length,
      inboundCount: state.length,
      outboundCount: states.length,
      score: state === 'failed' ? 200 : state === 'degraded' ? 120 : 40,
    }));
};

export const extractPlanDecisionTrail = (snapshot: OrchestrationSnapshot): SessionDecision => ({
  runId: brandRunId(String(snapshot.runId)),
  ticketId: `ticket-${snapshot.runId}`,
  accepted: snapshot.state === 'ready',
  reasonCodes: [snapshot.state, `${snapshot.signalCount}`],
  score: snapshot.riskLevel,
  createdAt: snapshot.createdAt,
});
