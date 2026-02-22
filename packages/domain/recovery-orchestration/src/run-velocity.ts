import type {
  RecoveryRunState,
  RecoveryCheckpoint,
  RecoveryStep,
  RecoveryProgram,
} from './types';

export interface StepProgress {
  readonly stepId: string;
  readonly progressRate: number;
  readonly elapsedMinutes: number;
}

export interface RunVelocityProfile {
  readonly runId: RecoveryRunState['runId'];
  readonly totalSteps: number;
  readonly completedSteps: number;
  readonly failedSteps: number;
  readonly progressRatio: number;
  readonly checkpointVelocity: readonly StepProgress[];
  readonly trend: 'accelerating' | 'steady' | 'decelerating';
}

export interface TimeWindow {
  readonly startedAt: string;
  readonly endedAt: string;
}

interface VelocityCursor {
  readonly windowMinutes: number;
  readonly errorBudget: number;
}

const parseWindowMinutes = (start: string, end: string): number => {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  const diff = Math.max(0, endMs - startMs);
  return Math.ceil(diff / 60000);
};

export const buildStepVelocity = (
  run: RecoveryRunState,
  checkpoints: readonly RecoveryCheckpoint[],
): StepProgress[] => {
  const checkpointsByStep = new Map<string, RecoveryCheckpoint[]>();
  for (const checkpoint of checkpoints) {
    const bucket = checkpointsByStep.get(checkpoint.stepId) ?? [];
    bucket.push(checkpoint);
    checkpointsByStep.set(checkpoint.stepId, bucket);
  }

  const ordered = Array.from(checkpointsByStep.entries()).map(([stepId, records]) => {
    const sorted = [...records].sort((left, right) =>
      Date.parse(left.createdAt) - Date.parse(right.createdAt),
    );
    const first = sorted[0];
    const last = sorted.at(-1);
    if (!first || !last) {
      return {
        stepId,
        progressRate: 0,
        elapsedMinutes: 0,
      };
    }
    const elapsedMinutes = parseWindowMinutes(first.createdAt, last.createdAt);
    const safeProgressRate = safePercent(
      Math.max(0, sorted.filter((entry) => entry.exitCode === 0).length),
      sorted.length,
    );
    return {
      stepId,
      progressRate: Number(safeProgressRate.toFixed(4)),
      elapsedMinutes,
    };
  });
  return ordered.sort((a, b) => b.progressRate - a.progressRate);
};

export const buildRunVelocity = (
  run: RecoveryRunState,
  program: RecoveryProgram,
  checkpoints: readonly RecoveryCheckpoint[],
): RunVelocityProfile => {
  const stepProgress = buildStepVelocity(run, checkpoints);
  const completedSteps = checkpoints.filter((entry) => entry.status === 'completed').length;
  const failedSteps = checkpoints.filter((entry) => entry.status === 'failed').length;
  const total = Math.max(1, program.steps.length);
  const progressRatio = safePercent(completedSteps, total);
  const trend = inferTrend(program.steps.length, stepProgress.length, completedSteps, failedSteps);
  return {
    runId: run.runId,
    totalSteps: total,
    completedSteps,
    failedSteps,
    progressRatio,
    checkpointVelocity: stepProgress,
    trend,
  };
};

export const forecastCompletionWindow = (
  run: RecoveryRunState,
  program: RecoveryProgram,
  checkpoints: readonly RecoveryCheckpoint[],
): TimeWindow => {
  const remaining = Math.max(0, program.steps.length - checkpoints.filter((checkpoint) => checkpoint.status === 'completed').length);
  const elapsed = run.startedAt ? Date.parse(new Date().toISOString()) - Date.parse(run.startedAt) : 0;
  const avgSpeed = checkpoints.length === 0 ? 600000 : elapsed / checkpoints.length;
  const remainingMs = remaining * avgSpeed;
  return {
    startedAt: new Date().toISOString(),
    endedAt: new Date(Date.now() + remainingMs).toISOString(),
  };
};

export const scoreVelocityProfile = (
  profile: RunVelocityProfile,
  cursor: VelocityCursor = { windowMinutes: 30, errorBudget: 0.25 },
): number => {
  const completionFactor = safePercent(profile.completedSteps, profile.totalSteps);
  const failurePenalty = safePercent(profile.failedSteps, Math.max(1, profile.checkpointVelocity.length));
  const trendMultiplier = profile.trend === 'accelerating' ? 1.2 : profile.trend === 'steady' ? 1 : 0.75;
  const budgetRatio = safePercent(Math.max(0, profile.failedSteps), Math.max(1, cursor.windowMinutes));
  const score = completionFactor * 0.5 + (1 - failurePenalty) * 0.3 + trendMultiplier * 0.2 - Math.min(0.1, budgetRatio / 100);
  return Number(Math.max(0, Math.min(1, score)).toFixed(4));
};

const safePercent = (numerator: number, denominator: number): number => {
  if (denominator <= 0) return 0;
  return numerator / denominator;
};

const inferTrend = (
  totalSteps: number,
  checkpoints: number,
  completedSteps: number,
  failedSteps: number,
): RunVelocityProfile['trend'] => {
  if (totalSteps === 0) return 'steady';
  const completionRate = completedSteps / totalSteps;
  const failureRate = failedSteps / Math.max(1, checkpoints);
  if (completionRate > 0.7 && failureRate < 0.1) return 'accelerating';
  if (completionRate < 0.2 && failureRate > 0.4) return 'decelerating';
  return 'steady';
};
