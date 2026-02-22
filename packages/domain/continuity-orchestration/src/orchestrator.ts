import { isTerminalState, ContinuityRunState, ContinuityRuntimeStep, ContinuityRuntimePlan, ContinuityExecutionContext, ContinuityEventEnvelope } from './types';
import { dependencyPaths } from './planner';

export type StepStatus = 'idle' | 'running' | 'done' | 'blocked' | 'retrying' | 'failed';

export interface RuntimeStepProgress {
  stepId: string;
  status: StepStatus;
  startedAt?: string;
  finishedAt?: string;
  attempts: number;
}

export interface OrchestrationProgress {
  runId: string;
  runState: ContinuityRunState;
  runStartedAt?: string;
  runFinishedAt?: string;
  stepProgress: Record<string, RuntimeStepProgress>;
}

export interface OrchestrationStepResult {
  stepId: string;
  ok: boolean;
  message: string;
  retriable: boolean;
}

export const buildInitialProgress = (plan: ContinuityRuntimePlan): OrchestrationProgress => {
  const stepProgress: Record<string, RuntimeStepProgress> = {};
  for (const step of plan.steps) {
    stepProgress[step.id] = {
      stepId: step.id,
      status: 'idle',
      attempts: 0,
    };
  }

  return { runId: plan.id, runState: 'pending', stepProgress };
};

export const canTransition = (state: ContinuityRunState, next: ContinuityRunState): boolean => {
  if (isTerminalState(state) || isTerminalState(next)) {
    return !isTerminalState(state) && isTerminalState(next);
  }
  if (state === 'running' && next === 'waiting') return true;
  if (state === 'waiting' && next === 'running') return true;
  if (state === 'pending' && next === 'running') return true;
  if ((state === 'running' || state === 'waiting') && next === 'cancelled') return true;
  if ((state === 'running' || state === 'waiting') && next === 'failed') return true;
  return state === 'pending' && next === 'running';
};

export const applyProgressTransition = (plan: OrchestrationProgress, next: ContinuityRunState): OrchestrationProgress => {
  if (plan.runState === next) return plan;
  if (!canTransition(plan.runState, next)) {
    return plan;
  }

  const nextPlan = { ...plan, runState: next, stepProgress: { ...plan.stepProgress } };
  if (next === 'running' && !nextPlan.runStartedAt) nextPlan.runStartedAt = new Date().toISOString();
  if (isTerminalState(next)) nextPlan.runFinishedAt = new Date().toISOString();
  return nextPlan;
};

export const canExecuteStep = (
  plan: Pick<OrchestrationProgress, 'stepProgress'>,
  step: ContinuityRuntimeStep,
  dependencies: readonly ContinuityRuntimeStep[],
): boolean => {
  const progress = plan.stepProgress[step.id];
  if (!progress || progress.status !== 'idle') return false;
  const completed = new Set(
    Object.values(plan.stepProgress)
      .filter((entry) => entry.status === 'done')
      .map((entry) => entry.stepId),
  );
  const dependencySet = new Set(dependencies.find((candidate) => candidate.id === step.id)?.dependencies ?? []);
  for (const dependency of dependencySet) {
    if (!completed.has(dependency)) return false;
  }
  return true;
};

const dependencyCountMap = (plan: OrchestrationProgress, allSteps: readonly ContinuityRuntimeStep[]): Record<string, number> => {
  const deps = dependencyPaths(allSteps.reduce((acc, step) => {
    acc[step.id] = [...step.dependencies] as string[];
    return acc;
  }, {} as Record<string, string[]>));
  const out: Record<string, number> = {};
  for (const step of allSteps) out[step.id] = 0;
  for (const edge of deps) out[edge.to] += 1;
  for (const edge of deps) {
    const from = plan.stepProgress[edge.from]?.status;
    if (from === 'done') out[edge.to] = Math.max(0, out[edge.to] - 1);
  }
  return out;
};

export const markStepStarted = (progress: OrchestrationProgress, stepId: string): OrchestrationProgress => {
  const current = progress.stepProgress[stepId];
  if (!current || current.status === 'running') return progress;
  return {
    ...progress,
    stepProgress: {
      ...progress.stepProgress,
      [stepId]: {
        ...current,
        status: 'running',
        startedAt: new Date().toISOString(),
        attempts: current.attempts + 1,
      },
    },
  };
};

export const markStepCompleted = (
  progress: OrchestrationProgress,
  result: OrchestrationStepResult,
): OrchestrationProgress => {
  const current = progress.stepProgress[result.stepId];
  if (!current) return progress;
  return {
    ...progress,
    stepProgress: {
      ...progress.stepProgress,
      [result.stepId]: {
        ...current,
        status: result.ok ? 'done' : result.retriable ? 'retrying' : 'failed',
        finishedAt: new Date().toISOString(),
      },
    },
  };
};

export const allStepsDone = (progress: OrchestrationProgress): boolean =>
  Object.values(progress.stepProgress).every((step) => step.status === 'done');

export const countFailedSteps = (progress: OrchestrationProgress): number =>
  Object.values(progress.stepProgress).reduce((count, step) => count + (step.status === 'failed' ? 1 : 0), 0);

export const nextStepCandidates = (
  progress: OrchestrationProgress,
  steps: readonly ContinuityRuntimeStep[],
): string[] => {
  const depCountByStep = dependencyCountMap(progress, steps);
  return steps
    .filter((step) => {
      const status = progress.stepProgress[step.id];
      return status && status.status === 'idle' && depCountByStep[step.id] === 0;
    })
    .map((step) => step.id);
};

export const summarizeProgress = (
  progress: OrchestrationProgress,
): ContinuityEventEnvelope<{ done: number; failed: number; total: number }> => {
  const done = Object.values(progress.stepProgress).reduce((n, step) => n + (step.status === 'done' ? 1 : 0), 0);
  const failed = countFailedSteps(progress);
  const total = Object.values(progress.stepProgress).length;
  return {
    runId: progress.runId as any,
    tenantId: 'system' as any,
    eventType: 'step.completed',
    when: new Date().toISOString(),
    correlationId: 'summary' as any,
    payload: { done, failed, total },
  };
};
