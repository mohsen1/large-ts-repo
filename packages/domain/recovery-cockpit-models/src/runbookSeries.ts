import { toTimestamp, PlanId } from './identifiers';
import { RecoveryPlan } from './runtime';
import { evaluatePlanContract } from './planContract';

export type RunbookRunId = `run:${string}`;
export type RunbookSeriesId = `series:${string}`;

export type RunbookRunState = 'queued' | 'executing' | 'paused' | 'completed' | 'failed';

export type RunbookRun = {
  readonly runId: RunbookRunId;
  readonly seriesId: RunbookSeriesId;
  readonly planId: PlanId;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly state: RunbookRunState;
  readonly stepCount: number;
  readonly completedSteps: number;
  readonly errors: readonly string[];
};

export type RunbookSeries = {
  readonly seriesId: RunbookSeriesId;
  readonly owner: string;
  readonly planId: PlanId;
  readonly name: string;
  readonly plannedStart: string;
  readonly runs: readonly RunbookRun[];
  readonly contractScore: number;
  readonly isAutomated: boolean;
};

export type RunbookSeriesWindow = {
  readonly seriesId: RunbookSeriesId;
  readonly windows: readonly { at: string; planned: boolean; completed: boolean }[];
  readonly trend: 'improving' | 'flat' | 'degrading';
};

const now = () => toTimestamp(new Date());

export const createSeriesId = (planId: PlanId): RunbookSeriesId => `series:${planId}:${Date.now()}` as RunbookSeriesId;
export const createRunId = (seriesId: RunbookSeriesId): RunbookRunId => `run:${seriesId}:${Math.random().toString(36).slice(2)}` as RunbookRunId;

export const createRunbookSeries = (plan: RecoveryPlan, owner: string): RunbookSeries => {
  const contract = evaluatePlanContract(plan);
  return {
    seriesId: createSeriesId(plan.planId),
    owner,
    planId: plan.planId,
    name: `${plan.labels.short}-series`,
    plannedStart: now(),
    runs: [],
    contractScore: contract.score,
    isAutomated: plan.mode === 'automated',
  };
};

export const appendRun = (series: RunbookSeries, state: RunbookRunState, errors: readonly string[] = []): RunbookSeries => {
  const run: RunbookRun = {
    runId: createRunId(series.seriesId),
    seriesId: series.seriesId,
    planId: series.planId,
    startedAt: now(),
    updatedAt: now(),
    state,
    stepCount: Math.max(1, series.runs.reduce((sum, item) => Math.max(sum, item.stepCount), 0) || 1),
    completedSteps: 0,
    errors,
  };

  return {
    ...series,
    runs: [...series.runs, run],
  };
};

export const markRunProgress = (series: RunbookSeries, runId: RunbookRunId, completedSteps: number): RunbookSeries => {
  const updatedRuns: readonly RunbookRun[] = series.runs.map((run): RunbookRun => {
    if (run.runId !== runId) {
      return run;
    }
    let state = run.state;
    if (state === 'paused') {
      state = 'executing';
    }
    return {
      ...run,
      updatedAt: now(),
      completedSteps,
      state,
      stepCount: Math.max(run.stepCount, completedSteps),
    };
  });

  return { ...series, runs: updatedRuns };
};

export const finalizeRun = (series: RunbookSeries, runId: RunbookRunId): RunbookSeries => {
  const updated: readonly RunbookRun[] = series.runs.map((run): RunbookRun => {
    if (run.runId !== runId) {
      return run;
    }
    return {
      ...run,
      updatedAt: now(),
      state: run.errors.length > 0 ? ('failed' as RunbookRunState) : ('completed' as RunbookRunState),
      completedSteps: run.stepCount,
    };
  });
  return { ...series, runs: updated };
};

export const isSeriesHealthy = (series: RunbookSeries): boolean => {
  if (series.runs.length === 0) return true;
  const last = series.runs.at(-1);
  if (!last) return true;
  if (last.state === 'failed') return false;
  if (last.completedSteps < last.stepCount) return false;
  if (series.contractScore < 60) return false;
  return true;
};

export const computeSeriesWindow = (series: RunbookSeries, windowCount = 5): RunbookSeriesWindow => {
  const windows = series.runs.slice(-windowCount).map((run) => ({
    at: run.startedAt,
    planned: run.stepCount > 0,
    completed: run.state === 'completed',
  }));
  const completed = windows.filter((entry) => entry.completed).length;
  const trend: RunbookSeriesWindow['trend'] =
    completed === windows.length ? 'improving' : completed === 0 ? 'degrading' : 'flat';

  return {
    seriesId: series.seriesId,
    windows,
    trend,
  };
};

export const summarizeSeries = (series: RunbookSeries): string => {
  const status = isSeriesHealthy(series) ? 'healthy' : 'unstable';
  return `${series.name} (${series.runs.length} runs) ${status}`;
};
