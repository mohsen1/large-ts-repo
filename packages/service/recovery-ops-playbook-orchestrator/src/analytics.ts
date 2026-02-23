import type { PlaybookExecutionPlan } from '@domain/recovery-ops-playbook';

export interface StepWindow {
  readonly stepId: string;
  readonly startedAt: string;
  readonly progress: number;
  readonly latencyMs: number;
}

export interface WindowStats {
  readonly totalLatencyMs: number;
  readonly meanLatencyMs: number;
  readonly maxLatencyMs: number;
}

export interface WindowQuality {
  readonly score: number;
  readonly normalized: number;
  readonly confidence: number;
}

export interface SimulationReport {
  readonly planId: string;
  readonly windows: readonly StepWindow[];
  readonly stats: WindowStats;
  readonly quality: WindowQuality;
  readonly timeline: readonly string[];
}

export interface StepBudget {
  readonly stepId: string;
  readonly budgetMs: number;
}

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

export const buildProgressTimeline = (windows: readonly StepWindow[]): StepWindow[] => {
  return [...windows]
    .map((window) => ({
      ...window,
      progress: clamp(window.progress),
      latencyMs: Math.max(1, window.latencyMs),
    }))
    .sort((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt));
};

export const summarizeWindows = (windows: readonly StepWindow[]): WindowStats => {
  if (windows.length === 0) {
    return { totalLatencyMs: 0, meanLatencyMs: 0, maxLatencyMs: 0 };
  }

  const values = windows.map((item) => item.latencyMs);
  const totalLatencyMs = values.reduce((sum, value) => sum + value, 0);
  return {
    totalLatencyMs,
    meanLatencyMs: totalLatencyMs / values.length,
    maxLatencyMs: Math.max(...values),
  };
};

export const scoreQuality = (windows: readonly StepWindow[]): WindowQuality => {
  const stats = summarizeWindows(windows);
  const score = windows.length === 0
    ? 0
    : Math.max(0, 100 - stats.totalLatencyMs / 100 - stats.meanLatencyMs / 20);
  return {
    score,
    normalized: clamp(score / 100),
    confidence: clamp(1 - 1 / (1 + windows.length)),
  };
};

export const budgetByPlan = (plan: PlaybookExecutionPlan): StepBudget[] => {
  return plan.order.map((stepId, index) => ({
    stepId,
    budgetMs: 1100 + index * 140 + stepId.length * 15,
  }));
};

export const analyzePlan = (plan: PlaybookExecutionPlan): { ok: true; value: SimulationReport } | { ok: false; error: string } => {
  if (plan.order.length === 0) {
    return { ok: false, error: 'Plan has no steps to execute' };
  }

  const budgets = budgetByPlan(plan);
  const timeline = budgets.map((entry) => `${entry.stepId}@${entry.budgetMs}`);
  const sample: StepWindow[] = plan.order.map((stepId, index) => ({
    stepId,
    startedAt: new Date().toISOString(),
    progress: index / Math.max(1, plan.order.length),
    latencyMs: budgets[index]?.budgetMs ?? 100,
  }));

  const sortedSample = buildProgressTimeline(sample);
  const windowStats = summarizeWindows(sortedSample);
  const quality = scoreQuality(sortedSample);

  return {
    ok: true,
    value: {
      planId: plan.runbook.id,
      windows: sortedSample,
      stats: windowStats,
      quality,
      timeline,
    },
  };
};
