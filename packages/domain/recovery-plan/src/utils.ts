import { normalizeLimit } from '@shared/core';
import type {
  RecoveryExecutionPlan,
  RecoveryPlanCandidate,
  RecoveryPlanId,
  RecoveryPlanSignal,
  RecoveryRoute,
  RecoveryStageName,
} from './types';
import type { RecoveryProgram, RecoveryRunState, RecoveryStep } from '@domain/recovery-orchestration';

export const buildRoute = (
  routeId: string,
  stepIds: readonly RecoveryStep['id'][],
  description: string,
  expectedSeconds: number,
  signals: readonly RecoveryPlanSignal[],
): RecoveryRoute => {
  const objectives = stepIds.map((stepId, index) => ({
    key: `${routeId}:${stepId}`,
    weight: Math.max(0.1, ((index + 1) / Math.max(stepIds.length, 1))),
    successCriteria: [
      `Complete ${stepId}`,
      `No unexpected failures in ${stepId}`,
    ],
  }));

  const signalWeight = signals.reduce((total, signal) => total + Math.max(0, signal.value), 0);
  return {
    id: routeId as RecoveryRoute['id'],
    stepIds,
    description,
    resilienceScore: Math.min(100, Math.max(1, 45 + signalWeight)),
    expectedSeconds: Math.max(30, expectedSeconds),
    objectives,
  };
};

const estimateRouteScore = (route: RecoveryRoute, runAgeMinutes: number): number => {
  const objectiveCount = route.objectives.length || 1;
  const routeWeight = route.objectives.reduce((sum, objective) => sum + objective.weight, 0);
  const agePenalty = Math.max(0, runAgeMinutes / 180);
  const expectedPenalty = route.expectedSeconds / 120;
  return routeWeight / objectiveCount * 10 + route.resilienceScore - agePenalty - expectedPenalty;
};

export const rankRouteCandidates = (
  routes: readonly RecoveryRoute[],
  runAgeMinutes: number,
): readonly RecoveryPlanCandidate[] => {
  const scored = routes.map((route) => ({
    id: `candidate:${route.id}` as RecoveryPlanCandidate['id'],
    route,
    estimatedMinutes: Math.max(1, Math.ceil(route.expectedSeconds / 60)),
    confidence: Math.min(100, Math.max(1, Math.round(estimateRouteScore(route, runAgeMinutes)))),
    blockingPolicyCount: 0,
    policyEvaluations: [],
    signals: [],
    rationale: [
      `route=${route.id}`,
      `steps=${route.stepIds.length}`,
      `score=${estimateRouteScore(route, runAgeMinutes).toFixed(1)}`,
    ],
  }));

  return scored
    .sort((left, right) => right.confidence - left.confidence || left.estimatedMinutes - right.estimatedMinutes)
    .slice(0, normalizeLimit(routes.length));
};

export const composeExecutionSequence = (
  program: RecoveryProgram,
  orderPreference: 'default' | 'least-risk'
): readonly RecoveryStep[] => {
  const ordered = orderPreference === 'least-risk'
    ? [...program.steps].sort((left, right) => (left.requiredApprovals + left.tags.length) - (right.requiredApprovals + right.tags.length))
    : [...program.steps];

  const dedup = new Set<string>();
  const steps: RecoveryStep[] = [];
  for (const step of ordered) {
    if (!dedup.has(step.id)) {
      dedup.add(step.id);
      steps.push(step);
    }
  }
  return steps;
};

const buildStageBySteps = (steps: readonly RecoveryStep[]): readonly RecoveryStageName[] => {
  const base: RecoveryStageName[] = ['prepare', 'execute'];
  if (steps.length > 2) base.push('validate');
  if (steps.length > 4) base.push('rollback');
  return base;
};

export const buildPlanBlueprint = (
  program: RecoveryProgram,
  runState: RecoveryRunState,
  candidates: readonly RecoveryPlanCandidate[],
): RecoveryExecutionPlan => {
  const sequence = composeExecutionSequence(program, 'least-risk');
  return {
    planId: `plan:${runState.runId}` as RecoveryPlanId,
    runId: runState.runId,
    version: 'v1',
    candidates,
    selected: (candidates[0]?.id ?? `candidate:${runState.runId}:fallback`) as RecoveryPlanCandidate['id'],
    stagedSequence: buildStageBySteps(sequence),
    metadata: {
      owner: runState.currentStepId ?? 'orchestrator',
      correlationId: `${runState.runId}:correlation`,
      environment: 'default',
      runWindow: {
        from: runState.startedAt ?? new Date().toISOString(),
        to: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        timezone: 'UTC',
      },
      tags: {
        tenant: runState.incidentId.split(':')[0] ?? 'unknown',
        program: program.name,
      },
    },
  };
};
