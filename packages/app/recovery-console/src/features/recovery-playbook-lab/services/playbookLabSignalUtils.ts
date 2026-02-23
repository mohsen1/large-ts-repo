import { withBrand } from '@shared/core';

export interface SignalWindow {
  readonly windowId: string;
  readonly start: string;
  readonly end: string;
  readonly timezone: string;
}

export interface SignalIndex {
  readonly playbookSignals: readonly string[];
  readonly globalCoverage: readonly number[];
  readonly windows: readonly SignalWindow[];
}

export const buildSignalWindows = (prefix: string): readonly SignalWindow[] => {
  const now = Date.now();
  return [
    {
      windowId: withBrand(`${prefix}:w1`, 'RecoveryPlanId'),
      start: new Date(now - 5 * 60 * 1000).toISOString(),
      end: new Date(now).toISOString(),
      timezone: 'UTC',
    },
    {
      windowId: withBrand(`${prefix}:w2`, 'RecoveryPlanId'),
      start: new Date(now - 15 * 60 * 1000).toISOString(),
      end: new Date(now - 5 * 60 * 1000).toISOString(),
      timezone: 'UTC',
    },
    {
      windowId: withBrand(`${prefix}:w3`, 'RecoveryPlanId'),
      start: new Date(now - 30 * 60 * 1000).toISOString(),
      end: new Date(now - 15 * 60 * 1000).toISOString(),
      timezone: 'UTC',
    },
  ];
};

export const buildRecoverySignalIndex = (requiredSignals: readonly string[]): SignalIndex => {
  const base = ['ops', 'telemetry', 'owner', 'manual', 'automation', 'health', 'sla'];
  const playbookSignals = requiredSignals.length
    ? requiredSignals
    : base;

  const globalCoverage = Array.from({ length: playbookSignals.length }, (_, index) => {
    const raw = ((index + 1) / (playbookSignals.length + 1)) + (index % 3) * 0.02;
    return Number(Math.min(1, raw).toFixed(2));
  });

  return {
    playbookSignals,
    globalCoverage,
    windows: buildSignalWindows('recovery-playbook-lab'),
  };
};

export const mergeSignalCatalog = (
  left: SignalIndex,
  right: SignalIndex,
): SignalIndex => ({
  playbookSignals: [...new Set([...left.playbookSignals, ...right.playbookSignals])],
  globalCoverage: left.globalCoverage.map((value, index) => Number(Math.min(1, (value + (right.globalCoverage[index] ?? value)) / 2).toFixed(2))),
  windows: [...left.windows, ...right.windows].slice(0, 6),
});

export const scoreSignalHealth = (index: SignalIndex): number => {
  if (index.playbookSignals.length === 0) return 0;
  const total = index.globalCoverage.reduce((acc, value) => acc + value, 0);
  return Number((total / index.globalCoverage.length).toFixed(3));
};

export const summarizeSignalIndex = (index: SignalIndex): string =>
  `signals=${index.playbookSignals.length} coverage=${scoreSignalHealth(index)}`;
