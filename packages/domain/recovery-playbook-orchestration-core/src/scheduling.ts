import type { PlaybookAutomationRunId, PlaybookPhase } from './models';

export interface CronWindow {
  fromHour: number;
  toHour: number;
  tz: string;
}

export interface CronSchedule {
  readonly id: string;
  readonly tenantId: string;
  readonly window: CronWindow;
  readonly phases: readonly PlaybookPhase[];
}

export interface ScheduleToken {
  readonly runId: PlaybookAutomationRunId;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

export interface ScheduleWindow {
  readonly runId: PlaybookAutomationRunId;
  readonly tenantId: string;
  readonly window: CronWindow;
}

const toMinutes = (from: number, to: number): number => Math.max(0, Math.abs(to - from) * 60);

export const parseWindow = (window: CronWindow): readonly PlaybookPhase[] => {
  const open = toMinutes(window.fromHour, window.toHour);
  const openRatio = Math.min(1, open / (24 * 60));

  if (openRatio >= 0.75) {
    return ['initialized', 'enqueued', 'simulated', 'executing', 'audited', 'finished'];
  }

  if (openRatio >= 0.4) {
    return ['initialized', 'enqueued', 'simulated', 'executing', 'audited'];
  }

  return ['initialized', 'enqueued', 'simulated', 'audited'];
};

export const issueSchedule = (tenantId: string, window: CronWindow): ScheduleWindow => {
  const start = new Date();
  const minutes = toMinutes(window.fromHour, window.toHour);
  const end = new Date(start.getTime() + minutes * 60 * 1000);

  return {
    runId: `schedule-${tenantId}:${start.toISOString()}` as PlaybookAutomationRunId,
    tenantId,
    window,
  } satisfies ScheduleWindow;
};

export const isWindowOpen = (window: CronWindow, at: Date = new Date()): boolean => {
  const hour = at.getUTCHours();
  return hour >= window.fromHour && hour < window.toHour;
};

export const estimateScheduleRisk = (schedule: CronSchedule): number => {
  const base = schedule.window.fromHour === schedule.window.toHour
    ? 0
    : schedule.window.toHour - schedule.window.fromHour;
  const covered = Math.max(0, Math.min(24, Math.abs(base)));
  const load = covered / 24;
  return 1 - Math.min(1, Math.max(0.05, load));
};

export const issueToken = (runId: PlaybookAutomationRunId, ttlMinutes = 15): ScheduleToken => {
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
  return { runId, issuedAt, expiresAt };
};
