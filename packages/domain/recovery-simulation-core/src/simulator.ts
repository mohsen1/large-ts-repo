import type { SimulationClockSample, SimulationRunRecord, SimulationState, SimulationStepExecution } from './types';

export interface SimulationTick {
  readonly runId: SimulationRunRecord['id'];
  readonly state: SimulationState;
  readonly stepId: SimulationStepExecution['stepId'];
  readonly startedAt: string;
}

export const computeClockSample = (start: string, durationMs: number): SimulationClockSample => ({
  startedAt: start,
  completedAt: new Date(Date.parse(start) + durationMs).toISOString(),
});

export const classifyRunState = (run: SimulationRunRecord): SimulationState => {
  if (run.state === 'queued' && run.executedSteps.every((step) => step.state === 'queued')) {
    return 'queued';
  }
  const failed = run.executedSteps.some((step) => step.state === 'failed');
  if (failed) return 'failed';
  const completed = run.executedSteps.every((step) => step.state === 'completed');
  if (completed) return 'completed';
  return run.state;
};

export const toTick = (run: SimulationRunRecord, stepId: SimulationRunRecord['id']): SimulationTick => ({
  runId: run.id,
  state: classifyRunState(run),
  stepId: run.executedSteps.at(0)?.stepId ?? (run.executedSteps.at(0)?.stepId ?? (stepId as unknown as SimulationStepExecution['stepId'])),
  startedAt: run.startedAt ?? run.createdAt,
});
