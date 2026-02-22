import { type SimulationWindow, type SimulationConstraint } from './types';

export interface Scheduler {
  readonly schedule: readonly SimulationWindow[];
}

export const buildDefaultScheduler = (constraints: SimulationConstraint, nodeCount: number): Scheduler => {
  const windowCount = Math.max(1, Math.min(6, nodeCount));
  const windows: SimulationWindow[] = [];
  for (let index = 0; index < windowCount; index += 1) {
    const window: SimulationWindow = {
      waveId: `window:${index}` as SimulationWindow['waveId'],
      startUtc: new Date(Date.now() + index * 60_000).toISOString(),
      endUtc: new Date(Date.now() + (index + 1) * 60_000).toISOString(),
      expectedSignals: constraints.maxSignalsPerWave,
      targetCount: constraints.maxParallelNodes,
      windowIndex: index,
    };
    windows.push(window);
  }
  return { schedule: windows };
};

export const scoreWindows = (scheduler: Scheduler): number =>
  scheduler.schedule.reduce((sum, window) => sum + window.expectedSignals, 0) / Math.max(1, scheduler.schedule.length);
