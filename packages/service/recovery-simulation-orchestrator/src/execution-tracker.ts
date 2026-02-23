import type { SimulationRunRecord } from '@domain/recovery-simulation-core';

export interface RunTimelinePoint {
  readonly stepId: string;
  readonly state: SimulationRunRecord['executedSteps'][number]['state'];
  readonly at: string;
  readonly marker: string;
}

export interface RunTelemetry {
  readonly runId: string;
  readonly commandCount: number;
  readonly progress: number;
  readonly elapsedMs: number;
  readonly timeline: readonly RunTimelinePoint[];
}

export const buildTimeline = (run: SimulationRunRecord): readonly RunTimelinePoint[] =>
  run.executedSteps.map((step, index) => ({
    stepId: step.stepId,
    state: step.state,
    at: step.startedAt ?? new Date(Date.now() + index * 1_000).toISOString(),
    marker: `${index}:${step.state}`,
  }));

export const buildTelemetry = (run: SimulationRunRecord): RunTelemetry => {
  const timeline = buildTimeline(run);
  const completed = timeline.filter((point) => point.state === 'completed').length;
  const elapsedMs = run.totalDurationMs ?? timeline.length * 1_500;
  return {
    runId: run.id,
    commandCount: run.executedSteps.length,
    progress: timeline.length === 0 ? 0 : completed / timeline.length,
    elapsedMs,
    timeline,
  };
};

export const telemetryLine = (run: SimulationRunRecord): string => {
  const telemetry = buildTelemetry(run);
  return `run=${telemetry.runId};progress=${Math.round(telemetry.progress * 100)}%;commands=${telemetry.commandCount};elapsed=${telemetry.elapsedMs}`;
};
