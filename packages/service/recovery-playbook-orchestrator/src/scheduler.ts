import type { ScenarioId, DriftSignal, ReadinessBandSnapshot } from '@domain/recovery-playbook-orchestration';

export interface Slot {
  readonly id: number;
  readonly label: string;
  readonly occupiedBy?: ScenarioId;
}

export const buildSlots = (size: number, signals: readonly DriftSignal[]): Slot[] => {
  const sorted = [...signals].sort((a, b) => b.confidence - a.confidence);
  return sorted.slice(0, size).map((signal, index) => ({
    id: index,
    label: signal.signal,
    occupiedBy: `scenario-${index + 1}` as ScenarioId,
  }));
};

export const estimateThroughput = (slots: readonly Slot[]): number => {
  const busy = slots.filter((slot) => slot.occupiedBy).length;
  if (slots.length === 0) {
    return 0;
  }
  return busy / slots.length;
};

export const makeReadinessSnapshot = (
  throughput: number,
  recentSignals: readonly DriftSignal[],
): ReadinessBandSnapshot => {
  const green = recentSignals.filter((item) => item.severity === 'low').length;
  const amber = recentSignals.filter((item) => item.severity === 'medium').length;
  const red = recentSignals.filter((item) => item.severity === 'high' || item.severity === 'critical').length;

  return {
    windowStart: new Date().toISOString(),
    scores: { green, amber, red },
    trend: throughput > 0.8 ? 'up' : throughput > 0.35 ? 'flat' : 'down',
  };
};
