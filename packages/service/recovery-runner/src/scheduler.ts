import { normalizeLimit } from '@shared/core';

import type {
  RecoveryRunState,
  RecoveryStep,
  RecoveryProgram,
} from '@domain/recovery-orchestration';
import { topologicalOrder } from '@domain/recovery-orchestration';

export interface StepSchedule {
  runId: RecoveryRunState['runId'];
  sequence: readonly RecoveryStep[];
  priorityScore: number;
  predictedDurationMinutes: number;
}

export interface ExecutionWindow {
  startedAt: string;
  endedAt?: string;
}

export const estimateStepsDurationMinutes = (steps: readonly RecoveryStep[]): number => {
  if (steps.length === 0) return 0;
  return Math.ceil(
    steps.reduce((total, step) => total + step.timeoutMs, 0) / 60000
  );
};

export const scheduleProgram = (
  run: RecoveryRunState,
  program: RecoveryProgram
): StepSchedule => {
  const executionOrder = topologicalOrder(program).map((id) =>
    program.steps.find((step) => step.id === id)!
  ).filter(Boolean);

  const constrainedCount = program.constraints.length;
  const priorityScore = (['platinum', 'gold', 'silver', 'bronze'].indexOf(program.priority) + 1) * (constrainedCount + 1);
  const predictedDurationMinutes = Math.max(
    1,
    estimateStepsDurationMinutes(executionOrder) + run.estimatedRecoveryTimeMinutes
  );

  return {
    runId: run.runId,
    sequence: executionOrder,
    priorityScore,
    predictedDurationMinutes,
  };
};

export const pickWindow = (run: RecoveryRunState, runAt?: string): ExecutionWindow => {
  const startedAt = run.startedAt ?? runAt ?? new Date().toISOString();
  const endedAt = run.completedAt ?? undefined;
  return { startedAt, endedAt };
};

export const shouldThrottle = (run: RecoveryRunState, maxParallel = 3) => {
  return normalizeLimit(maxParallel) <= 1 || run.status === 'running';
};
