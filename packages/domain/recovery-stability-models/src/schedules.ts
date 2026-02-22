import type { StabilityRunId } from './models';

export type Cadence = 'ad-hoc' | 'every-5m' | 'every-15m' | 'hourly' | 'daily';
export type ShiftWindow = 'utc-4' | 'utc-5' | 'utc-6' | 'utc+0' | 'utc+1';

export interface StabilityCadence {
  readonly runId: StabilityRunId;
  readonly enabled: boolean;
  readonly cadence: Cadence;
  readonly shift: ShiftWindow;
  readonly ownerTeam: string;
  readonly timezone: string;
}

export interface ExecutionWindow {
  readonly runId: StabilityRunId;
  readonly openAt: string;
  readonly closeAt: string;
  readonly cooldownMinutes: number;
}

export const buildExecutionWindow = (
  runId: StabilityRunId,
  dayOffset: number,
): ExecutionWindow => {
  const base = Date.now() + dayOffset * 86_400_000;
  const open = new Date(base).toISOString();
  const close = new Date(base + 20 * 60 * 1000).toISOString();
  return {
    runId,
    openAt: open,
    closeAt: close,
    cooldownMinutes: 15,
  };
};

export const inferCadence = (volumeSignal: number): Cadence => {
  if (volumeSignal > 1000) return 'every-5m';
  if (volumeSignal > 300) return 'every-15m';
  if (volumeSignal > 80) return 'hourly';
  return 'daily';
};
