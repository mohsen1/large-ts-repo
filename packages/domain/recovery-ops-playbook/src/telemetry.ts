import type {
  PlaybookExecutionPlan,
  PlaybookProjection,
  PlaybookRun,
  PlaybookStepId,
  ReadinessSignal,
} from './types';

export interface ProgressWindow {
  readonly step: PlaybookStepId;
  readonly progress: number;
  readonly timestamp: string;
  readonly latencyMs: number;
}

export interface TelemetrySnapshot {
  readonly run: PlaybookRun;
  readonly windows: readonly ProgressWindow[];
  readonly projection: PlaybookProjection;
  readonly lastSignal?: ReadinessSignal;
}

export interface PlaybookMetrics {
  readonly runId: string;
  readonly completionRatio: number;
  readonly elapsedMinutes: number;
  readonly failureRatio: number;
  readonly confidence: number;
}

const toMinutes = (start: string, end: string): number => {
  const startTs = Date.parse(start);
  const endTs = Date.parse(end);
  const delta = endTs - startTs;
  return delta <= 0 ? 0 : delta / (1000 * 60);
};

export const summarizePlan = (plan: PlaybookExecutionPlan): PlaybookMetrics => {
  const startedAt = plan.runbook.startedAt;
  const entries = Object.values(plan.runbook.outcomeByStep);
  const totalSteps = entries.length;
  const passed = entries.filter((outcome) => outcome.status === 'passed').length;
  const failed = entries.filter((outcome) => outcome.status === 'failed').length;
  const failureRatio = totalSteps === 0 ? 0 : failed / totalSteps;
  const completionRatio = totalSteps === 0 ? 0 : passed / totalSteps;
  const elapsedMinutes = toMinutes(startedAt, new Date().toISOString());
  const confidence = Math.max(0.05, Math.min(1, 1 - failureRatio));

  return {
    runId: plan.runbook.id,
    completionRatio,
    elapsedMinutes,
    failureRatio,
    confidence,
  };
};

export const buildProjection = (run: PlaybookRun, order: readonly PlaybookStepId[]): PlaybookProjection => {
  const activeStep = order.find((stepId) => {
    const status = run.outcomeByStep[stepId]?.status;
    return status === 'running' || status === 'pending';
  }) ?? null;

  const completedSteps = order.filter((stepId) => run.outcomeByStep[stepId]?.status === 'passed');
  const failedSteps = order.filter((stepId) => run.outcomeByStep[stepId]?.status === 'failed');

  return {
    playbookId: run.playbookId,
    runId: run.id,
    activeStep,
    completedSteps: [...completedSteps],
    failedSteps: [...failedSteps],
    confidence: order.length === 0 ? 0 : Math.max(0, 1 - failedSteps.length / order.length),
  };
};

export const projectSignal = (run: PlaybookRun): ReadinessSignal => {
  const failedEntry = Object.entries(run.outcomeByStep).find(([, outcome]) => outcome.status === 'failed');
  const firstStep = Object.keys(run.outcomeByStep)[0] as PlaybookStepId;
  const selected = failedEntry ? (failedEntry[0] as PlaybookStepId) : firstStep;

  const failureCount = Object.values(run.outcomeByStep).filter((entry) => entry.status === 'failed').length;
  const score = failureCount === 0 ? 90 : Math.max(20, 80 - failureCount * 20);
  const confidence = failureCount === 0 ? 0.96 : Math.max(0.35, 1 - failureCount * 0.15);
  const evidence = Object.entries(run.outcomeByStep)
    .filter(([, outcome]) => outcome.status === 'failed' || outcome.status === 'passed')
    .map(([stepId, outcome]) => `${stepId}:${outcome.status}`);

  return {
    stepId: selected,
    score,
    confidence,
    evidence,
  };
};

export const buildSnapshot = (plan: PlaybookExecutionPlan, windows: readonly ProgressWindow[]): TelemetrySnapshot => {
  const projection = buildProjection(plan.runbook, plan.order);
  const latest = windows[windows.length - 1];
  const lastSignal = latest ? projectSignal(plan.runbook) : undefined;

  return {
    run: plan.runbook,
    windows,
    projection,
    lastSignal,
  };
};
