import type { CadenceExecutionMode, CadenceWindow, FabricNodeId, FabricSignal, FabricSignalEnvelope } from './types';

const slotMinutes = 5;

export interface CadenceSlot {
  readonly window: CadenceWindow;
  readonly riskScore: number;
  readonly readyInMs: number;
}

const rankByRisk = (signals: readonly FabricSignalEnvelope[]): readonly FabricSignal[] =>
  [...signals]
    .map((entry) => entry.signal)
    .sort((left, right) => right.weight * right.intensity - left.weight * left.intensity);

export const scheduleWindows = (signals: readonly FabricSignalEnvelope[], mode: CadenceExecutionMode): CadenceWindow[] => {
  const ranked = rankByRisk(signals);

  return ranked.map((signal, index) => ({
    windowId: `window:${signal.signalId}:${index}` as const,
    index,
    startIso: new Date(Date.now() + index * slotMinutes * 60 * 1000).toISOString(),
    endIso: new Date(Date.now() + (index + 1) * slotMinutes * 60 * 1000).toISOString(),
    nodeIds: [signal.signalId.replace('signal:', 'node:') as FabricNodeId],
    requestedMode: mode,
  }));
};

const score = (window: CadenceWindow): number => window.nodeIds.length / 10;

export const scoreWindows = (windows: readonly CadenceWindow[]): readonly CadenceSlot[] =>
  windows.map((window) => ({
    window,
    riskScore: Math.max(0, 1 - score(window)),
    readyInMs: window.index * 1_000,
  }));

export const assignSlots = (
  windows: readonly CadenceWindow[],
  maxParallelism: number,
): ReadonlyMap<number, readonly CadenceWindow[]> => {
  const buckets = new Map<number, CadenceWindow[]>();
  for (const window of windows) {
    const bucket = Math.floor(window.index / Math.max(1, maxParallelism));
    buckets.set(bucket, [...(buckets.get(bucket) ?? []), window]);
  }
  return buckets;
};

export const mergeSignals = (slots: readonly CadenceSlot[]): readonly string[] =>
  slots.map((slot) => `${slot.window.windowId}:${slot.window.nodeIds.join(',')}`);
