import { RecoveryPlan, UtcIsoTimestamp, computeReadiness } from '@domain/recovery-cockpit-models';
import { buildCriticalPath, buildDependencyGraph } from './dependencyGraph';

export type ForecastMode = 'conservative' | 'balanced' | 'aggressive';

export type ForecastWindow = {
  readonly at: UtcIsoTimestamp;
  readonly value: number;
  readonly delta: number;
  readonly factors: readonly string[];
};

export type PlanForecast = {
  readonly planId: string;
  readonly mode: ForecastMode;
  readonly windows: readonly ForecastWindow[];
  readonly summary: number;
};

const modeFactor = (mode: ForecastMode): number => {
  if (mode === 'aggressive') return 1.2;
  if (mode === 'conservative') return 0.72;
  return 1;
};

export const buildForecastEnvelope = (forecast: PlanForecast): {
  readonly min: number;
  readonly max: number;
  readonly median: number;
  readonly trend: 'up' | 'down' | 'flat';
} => {
  if (forecast.windows.length === 0) {
    return { min: 0, max: 0, median: 0, trend: 'flat' };
  }

  const values = forecast.windows.map((window) => window.value).sort((left, right) => left - right);
  const min = values[0] ?? 0;
  const max = values.at(-1) ?? 0;
  const median = values[Math.floor(values.length / 2)] ?? 0;
  const first = values[0] ?? 0;
  const last = values.at(-1) ?? 0;
  const trend = last > first ? 'up' : last < first ? 'down' : 'flat';
  return { min, max, median, trend };
};

const buildWindows = (plan: RecoveryPlan): ReadonlyArray<{ at: Date; index: number; base: number }> => {
  const graph = buildDependencyGraph(plan.actions);
  const criticalPath = new Set(buildCriticalPath(graph));
  const regionWeights = plan.actions.reduce((acc, action) => {
    acc.set(action.region, (acc.get(action.region) ?? 0) + action.expectedDurationMinutes);
    return acc;
  }, new Map<string, number>());

  return plan.actions.map((action, index) => {
    const rank = graph.rank.get(action.id) ?? 0;
    const regionWeight = regionWeights.get(action.region) ?? 0;
    const criticalBoost = criticalPath.has(action.id) ? 1.4 : 1;
    const base = 100 - (action.expectedDurationMinutes + rank + regionWeight) * criticalBoost + index;
    return {
      at: new Date(Date.now() + index * 4 * 60 * 1000),
      index,
      base,
    };
  });
};

export const buildPlanForecast = (plan: RecoveryPlan, mode: ForecastMode = 'balanced'): PlanForecast => {
  const modeScale = modeFactor(mode);
  const windows = buildWindows(plan);

  const projected: ForecastWindow[] = [];
  for (const current of windows) {
    const readiness = computeReadiness(100, Math.max(0, current.base));
    const value = Math.min(100, Math.max(0, (readiness * modeScale) - current.index * 0.25));
    const previous = windows[current.index - 1];
    let previousValue = readiness;
    if (previous) {
      previousValue = computeReadiness(100, Math.max(0, previous.base));
    }
    const delta = current.index === 0 ? 0 : Number((value - previousValue).toFixed(2));

    projected.push({
      at: current.at.toISOString() as UtcIsoTimestamp,
      value: Number(value.toFixed(2)),
      delta,
      factors: ['dependency', `rank:${current.index}`, 'mode'],
    });
  }

  const summary = projected.reduce((acc, window) => acc + window.value, 0) / Math.max(1, projected.length);
  return {
    planId: plan.planId,
    mode,
    windows: projected,
    summary: Number(summary.toFixed(2)),
  };
};

export const buildReadinessProjection = (plan: RecoveryPlan, mode: 'automated' | 'manual' | 'semi'): ReadonlyArray<{ at: Date; value: number }> => {
  const forecast = buildPlanForecast(plan, mode === 'automated' ? 'aggressive' : mode === 'manual' ? 'conservative' : 'balanced');
  return forecast.windows.map((entry) => ({
    at: new Date(entry.at),
    value: entry.value,
  }));
};

export const toReadinessWindows = (forecast: PlanForecast): ReadonlyArray<{ at: UtcIsoTimestamp; score: number }> =>
  forecast.windows.map((entry) => ({ at: entry.at, score: entry.value }));
