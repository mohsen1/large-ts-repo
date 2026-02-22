import type { StabilityRunId } from '@domain/recovery-stability-models';
import { buildExecutionWindow, inferCadence, type Cadence } from '@domain/recovery-stability-models';

export interface SchedulerInput {
  readonly runId: StabilityRunId;
  readonly signalVolume: number;
  readonly priorityBoost: number;
}

export interface ScheduledCadencePlan {
  readonly runId: StabilityRunId;
  readonly cadence: Cadence;
  readonly cooldownMinutes: number;
  readonly openAt: string;
  readonly closeAt: string;
}

export const computeCadencePlan = ({ runId, signalVolume, priorityBoost }: SchedulerInput): ScheduledCadencePlan => {
  const cadence = inferCadence(signalVolume);
  const window = buildExecutionWindow(runId, priorityBoost);

  const scaled =
    cadence === 'every-5m' ? 5 :
    cadence === 'every-15m' ? 15 :
    cadence === 'hourly' ? 60 :
    120;

  const closeDate = new Date(new Date(window.closeAt).getTime() + scaled * 60 * 1000).toISOString();
  return {
    runId,
    cadence,
    cooldownMinutes: Math.max(5, Math.round(30 / (priorityBoost + 1))),
    openAt: window.openAt,
    closeAt: closeDate,
  };
};
