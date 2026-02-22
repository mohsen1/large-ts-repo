import { OperationWindow } from '@domain/operations-orchestration';

export interface ScheduledWindow {
  id: string;
  window: OperationWindow;
}

export interface BatchScheduleOptions {
  dryRun?: boolean;
  maxInFlight?: number;
}

export const normalizeOperationWindow = (window: OperationWindow): OperationWindow => {
  const starts = new Date(window.startsAt);
  const ends = new Date(window.endsAt);
  if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime())) {
    throw new Error('Invalid operation window');
  }
  return {
    startsAt: starts.toISOString(),
    endsAt: ends.toISOString(),
    kind: window.kind,
  };
};

export const buildBatchSchedule = (windows: readonly OperationWindow[]): ScheduledWindow[] =>
  windows.map((window, index) => ({
    id: `window-${index}`,
    window: normalizeOperationWindow(window),
  }));

export const coerceMaxInFlight = (options: BatchScheduleOptions = {}): number => {
  const candidate = options.maxInFlight ?? 1;
  if (!Number.isFinite(candidate) || candidate < 1) return 1;
  return Math.floor(candidate);
};

export const toTimeline = (input: readonly OperationWindow[]): string[] =>
  input.map((item) => `${item.startsAt}=>${item.endsAt}`);
