import type { SimulationConstraint, SimulationWindow } from './types';

const minuteFromUtc = (iso: string): number => {
  const date = new Date(iso);
  return isNaN(date.getTime()) ? 0 : date.getUTCMinutes();
};

export const makeWindowGrid = (nodeCount: number, targetSignals: number): readonly number[] => {
  const windows = Math.max(1, Math.min(6, nodeCount || 1));
  return [...Array(windows).keys()].map((index) => index * Math.max(1, targetSignals) * 60_000);
};

export const resolveWindowCoverage = (constraints: SimulationConstraint, windowCount: number): number => {
  const baseMinutes = windowCount === 0 ? 1 : 60 / windowCount;
  const minCoverage = Math.max(2, Math.floor(constraints.maxSignalsPerWave / Math.max(1, windowCount)));
  return Math.max(baseMinutes, minCoverage);
};

export const buildWindowSchedule = (constraints: SimulationConstraint, windows: readonly SimulationWindow[]): readonly SimulationWindow[] => {
  const blackoutByStart = new Set(
    constraints.blackoutWindows.map((window) => minuteFromUtc(window.startUtc)),
  );
  const schedule = windows
    .map((window, index) => {
      const minute = minuteFromUtc(window.startUtc) + index;
      const blocked = blackoutByStart.has(minute);
      return {
        ...window,
        expectedSignals: blocked ? 0 : window.expectedSignals,
      };
    })
    .filter((window) => window.expectedSignals > 0 || window.targetCount > 0);

  return schedule;
};
