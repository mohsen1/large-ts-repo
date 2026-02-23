import { UtcIsoTimestamp, DomainVersion } from './identifiers';
import { RecoveryPlan } from './runtime';

export type Cadence = 'minutes' | 'hours' | 'days' |
  'weeks';

export type ScheduleWindow = {
  timezone: string;
  start: UtcIsoTimestamp;
  end: UtcIsoTimestamp;
  weekdays: ReadonlyArray<number>;
};

export type PlanCadence = {
  cadence: Cadence;
  value: number;
  window: ScheduleWindow;
};

export type DriftBudget = {
  allowedSkewMinutes: number;
  maxRetryBackoffMinutes: number;
  maxAbortThreshold: number;
};

export type RecoveryPlanEnvelope<TPlan extends RecoveryPlan = RecoveryPlan> = {
  plan: TPlan;
  cadence: PlanCadence;
  budget: DriftBudget;
  isRecurring: boolean;
  nextRunAt?: UtcIsoTimestamp;
  tags: ReadonlyArray<string>;
  version: DomainVersion;
};

export const toCadenceSummary = (cadence: PlanCadence): string =>
  `${cadence.value} ${cadence.cadence} at ${cadence.window.timezone}`;

export const withinWindow = (
  now: Date,
  window: ScheduleWindow,
): boolean => {
  const start = new Date(window.start).getTime();
  const end = new Date(window.end).getTime();
  const tick = now.getTime();
  return tick >= start && tick <= end;
};

export const nextWindowBoundary = (window: ScheduleWindow): Date => {
  const end = new Date(window.end);
  if (!Number.isNaN(end.getTime())) {
    end.setMinutes(end.getMinutes() + 1);
    return end;
  }
  return new Date(window.start);
};

export const mapToScheduleWindow = (at: string, timezone = 'UTC', shiftHours = 1): ScheduleWindow => {
  const start = new Date(at);
  const end = new Date(start.getTime() + shiftHours * 60 * 60 * 1000);
  return {
    timezone,
    start: start.toISOString() as UtcIsoTimestamp,
    end: end.toISOString() as UtcIsoTimestamp,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
  };
};
