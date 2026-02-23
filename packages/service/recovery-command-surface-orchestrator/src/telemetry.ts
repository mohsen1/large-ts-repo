import type { SurfaceRun, SurfaceSignal, SurfacePlan } from '@domain/recovery-command-surface-models';

export interface SignalRollup {
  readonly totalSignals: number;
  readonly criticalSignals: number;
  readonly byUnit: Readonly<Record<string, number>>;
  readonly trend: readonly {
    readonly key: string;
    readonly count: number;
    readonly average: number;
  }[];
}

const isCritical = (signal: SurfaceSignal): boolean => {
  if (signal.unit === 'percent') return signal.value > 85;
  if (signal.unit === 'ms') return signal.value > 2_000;
  return false;
};

export const buildSignalRollup = (run: SurfaceRun): SignalRollup => {
  const criticalSignals = run.signals.filter(isCritical).length;
  const byUnit: Record<string, number> = {};
  for (const signal of run.signals) {
    byUnit[signal.unit] = (byUnit[signal.unit] ?? 0) + 1;
  }
  const buckets = new Map<string, { total: number; count: number }>();
  for (const signal of run.signals) {
    const entry = buckets.get(signal.key) ?? { total: 0, count: 0 };
    buckets.set(signal.key, { total: entry.total + signal.value, count: entry.count + 1 });
  }
  const trend = [...buckets.entries()]
    .map(([key, metrics]) => ({
      key,
      count: metrics.count,
      average: metrics.total / metrics.count,
    }))
    .sort((left, right) => right.count - left.count);

  return {
    totalSignals: run.signals.length,
    criticalSignals,
    byUnit,
    trend,
  };
};

export const enrichRunWithPlan = (
  plan: SurfacePlan,
  run: SurfaceRun,
): SurfaceRun => ({
  ...run,
  riskScore: Math.max(plan.constraints.maxRisk, run.riskScore),
});
