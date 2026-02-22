import type { FabricWindow } from './types';

export interface FabricWindowPlan {
  readonly windows: readonly string[];
  readonly blackoutWindows: readonly string[];
  readonly isOpen: boolean;
  readonly windowCount: number;
}

export interface CadencePoint {
  readonly at: string;
  readonly canRun: boolean;
  readonly severityHint: 'green' | 'yellow' | 'red';
}

const parseUtc = (value: string): number => new Date(value).getTime();

const addMinutesMs = (value: number, minutes: number): number => value + minutes * 60 * 1000;

const nowMinutesKey = (value: number): string => new Date(value).toISOString();

export const buildCadence = (window: FabricWindow, windowMinutes: number): readonly CadencePoint[] => {
  const start = parseUtc(window.startedAt);
  const end = parseUtc(window.endsAt);
  const blackouts = new Set(window.blackoutAt ?? []);
  const points: CadencePoint[] = [];
  let current = start;

  while (current <= end) {
    const at = nowMinutesKey(current);
    const isBlackout = blackouts.has(at);
    points.push({
      at,
      canRun: !isBlackout,
      severityHint: isBlackout ? 'red' : isWorkHour(new Date(current)) ? 'green' : 'yellow',
    });
    current = addMinutesMs(current, windowMinutes);
  }

  return points;
};

const isWorkHour = (value: Date) => {
  const hour = value.getUTCHours();
  return hour >= 8 && hour <= 20;
};

export const toWindowPlan = (window: FabricWindow): FabricWindowPlan => {
  const points = buildCadence(window, 15);
  return {
    windows: points.map((point) => point.at),
    blackoutWindows: window.blackoutAt ?? [],
    isOpen: points.every((point) => point.canRun),
    windowCount: points.length,
  };
};

export const estimateWindowCoverage = (window: FabricWindow): number => {
  const plan = toWindowPlan(window);
  if (plan.windowCount === 0) return 0;
  const openCount = plan.windows.length - plan.blackoutWindows.length;
  const coverage = (openCount / plan.windows.length) * 100;
  return Number(coverage.toFixed(2));
};

export const isWindowExpired = (window: FabricWindow, now = new Date()): boolean => {
  return parseUtc(window.endsAt) < now.getTime();
};

export const nextWindowSlot = (window: FabricWindow, anchor = new Date()): string | undefined => {
  const windows = buildCadence(window, 5);
  const eligible = windows.find((point) => new Date(point.at).getTime() >= anchor.getTime() && point.canRun);
  return eligible?.at;
};
