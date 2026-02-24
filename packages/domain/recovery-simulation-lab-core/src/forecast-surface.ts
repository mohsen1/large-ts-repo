import type { LabSignal, LabExecutionResult, LabScenario, LabPlanTemplate, LabLane } from './models';
import type { NoInfer } from '@shared/type-level';
import { createDisposableScope, collect, mapIterator } from '@shared/recovery-lab-kernel';
import { asLabTenantId } from '@shared/recovery-lab-kernel';

export type SurfaceSignal = Pick<LabSignal, 'name' | 'lane' | 'severity' | 'value' | 'createdAt'>;
export type ForecastWindowSize<T extends number> = T extends 1
  ? readonly [number]
  : T extends 2
    ? readonly [number, number]
    : T extends 3
      ? readonly [number, number, number]
      : readonly number[];

export type RecursiveWindow<TSignals extends readonly SurfaceSignal[]> =
  TSignals extends readonly [infer _Head, ...infer Tail]
    ? readonly [TSignals[0], ...RecursiveWindow<Extract<Tail, readonly SurfaceSignal[]>>]
    : readonly [];

export interface SurfacePlan {
  readonly planId: string;
  readonly scope: string;
  readonly metric: string;
  readonly predicted: number;
  readonly confidence: number;
}

export interface ForecastWindow {
  readonly from: number;
  readonly to: number;
  readonly mean: number;
  readonly max: number;
  readonly min: number;
}

export interface ForecastTrace {
  readonly route: string;
  readonly planId: string;
  readonly lane: LabLane;
  readonly windows: readonly ForecastWindow[];
  readonly metrics: Record<string, number>;
}

export interface ForecastSummary {
  readonly tenant: string;
  readonly scenarios: number;
  readonly windows: readonly ForecastWindow[];
  readonly topSignals: readonly [string, number][];
}

type MetricObjectKeys<T extends Record<PropertyKey, number>> = Extract<keyof T, string | number>;

export type TraceMetricMap<T extends Record<PropertyKey, number>> = {
  [K in MetricObjectKeys<T>]: T[K] extends number ? `m:${K & string}` : never;
}[MetricObjectKeys<T>];

const WINDOW_STEPS = [4, 8, 16, 32] as const satisfies readonly number[];
const KNOWN_LANES = ['ingest', 'simulate', 'verify', 'restore', 'report'] as const satisfies readonly LabLane[];

const normalizeSignal = (signal: SurfaceSignal): SurfaceSignal => ({
  ...signal,
  lane: (KNOWN_LANES.includes(signal.lane) ? signal.lane : 'simulate') as LabLane,
});

const percentile = (values: readonly number[], ratio: number): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = values.toSorted((left, right) => left - right);
  const safeRatio = Math.min(1, Math.max(0, ratio));
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * safeRatio)));
  return sorted[index] ?? 0;
};

export const buildForecastWindow = <TSignals extends readonly SurfaceSignal[]>(
  signals: TSignals,
  maxEntries: number,
): ForecastWindow => {
  const values = signals.map((signal) => signal.value).filter((value) => Number.isFinite(value));
  const mean = values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
  return {
    from: values.length,
    to: values.length + maxEntries,
    mean,
    max: percentile(values, 0.95),
    min: percentile(values, 0.05),
  };
};

export const rankSignalMap = <TSignals extends readonly SurfaceSignal[]>(
  signals: TSignals,
): readonly [string, number][] => {
  const counts = new Map<string, number>();
  for (const signal of signals) {
    const key = `${signal.name}:${signal.lane}`;
    counts.set(key, (counts.get(key) ?? 0) + signal.value);
  }
  return collect(mapIterator(counts.entries(), ([label, score]) => ({ label, score } as const)))
    .map((entry) => [entry.label, entry.score] as [string, number])
    .toSorted((left, right) => right[1] - left[1]);
};

export const buildTracePlan = <TScenario extends LabScenario, TPlans extends readonly LabPlanTemplate[]>(
  scenario: TScenario,
  plans: NoInfer<TPlans>,
): ForecastTrace => {
  const normalized = scenario.signals.map(normalizeSignal).toSorted((left, right) => right.value - left.value);
  const lanes = Array.from(new Set(normalized.map((entry) => entry.lane)));
  const metrics = lanes.reduce<Record<string, number>>((acc, lane) => ({
    ...acc,
    [`${lane}-count`]: normalized.filter((entry) => entry.lane === lane).length,
    [`${lane}-max`]: Math.max(0, ...normalized.filter((entry) => entry.lane === lane).map((entry) => entry.value)),
  }), {});

  const route = `${scenario.scenarioId}::${plans.length}`;
  const plan = plans.find((entry) => entry.scenarioId === scenario.scenarioId) ?? plans.at(0);

  return {
    route,
    planId: `${plan?.scenarioId ?? scenario.scenarioId}-forecast`,
    lane: scenario.lane,
    windows: plan
      ? normalized.map((_, index) => buildForecastWindow(normalized.slice(index), 4 + index))
      : [],
    metrics,
  };
};

export const buildForecastSummary = (
  tenant: string,
  scenarios: readonly LabScenario[],
  plans: readonly LabPlanTemplate[],
): ForecastSummary => {
  const normalizedTenant = asLabTenantId(tenant);
  const windows = scenarios.flatMap((scenario) => {
    const trace = buildTracePlan(scenario, plans);
    return trace.windows;
  });

  return {
    tenant: `${normalizedTenant}`,
    scenarios: scenarios.length,
    windows: windows.toSorted((left, right) => right.mean - left.mean),
    topSignals: rankSignalMap(scenarios.flatMap((scenario) => scenario.signals)),
  };
};

export const buildResultForecast = (result: LabExecutionResult): ForecastTrace => {
  const topSignals = result.steps
    .map((step, index) => ({
      name: step.message,
      lane: result.execution.lane === 'ingest' ? 'simulate' : result.execution.lane,
      severity: 'low' as const,
      value: step.score + (index * 0.2),
      createdAt: new Date(result.context.startedAt).toISOString(),
    }) satisfies SurfaceSignal)
    .slice(0, 20);

  const route = `${result.execution.executionId}::${result.execution.tenant}`;
  const windows = WINDOW_STEPS.map((windowSize, index) =>
    buildForecastWindow(topSignals, windowSize + index),
  );

  return {
    route,
    planId: `${result.execution.executionId}`,
    lane: result.execution.lane === 'ingest' ? 'simulate' : result.execution.lane,
    windows,
    metrics: {
      steps: result.steps.length,
      outputSeverity: result.health,
      telemetry: result.telemetry.metrics.stepCount,
    },
  };
};

const windowFromPlan = <TPlan extends readonly LabPlanTemplate[]>(plans: TPlan): readonly number[] =>
  plans.map((plan) => plan.expectedMs + plan.stepIds.length);

export const buildCompositeForecast = <TSignals extends readonly SurfaceSignal[]>(
  tenant: string,
  signals: TSignals,
  planTemplates: readonly LabPlanTemplate[],
): ForecastSummary => {
  const grouped = new Map<string, number>();
  for (const signal of signals) {
    const bucket = `${signal.lane}:${signal.severity}`;
    grouped.set(bucket, (grouped.get(bucket) ?? 0) + signal.value);
  }

  const routeWindows = Array.from(grouped, ([entry, score], index) => {
    const offset = planTemplates.at(index % Math.max(1, planTemplates.length))?.expectedMs ?? index;
    const length = entry.length;
    return {
      from: length,
      to: length + offset,
      mean: score / Math.max(1, planTemplates.length),
      max: score * 1.5,
      min: score * 0.5,
    };
  });

  const plans = [...new Set(planTemplates.map((plan) => `${plan.scenarioId}`))];

  return {
    tenant,
    scenarios: plans.length,
    windows: routeWindows.toSorted((left, right) => right.mean - left.mean),
    topSignals: [...grouped.entries()].map(([scope, score]) => [scope, score]),
  };
};

const defaultScenarioWindow = async <TSignals extends readonly SurfaceSignal[]>(
  signals: TSignals,
): Promise<readonly SurfaceSignal[]> => {
  const scope = createDisposableScope();
  await using _scope = scope;
  return signals.map(normalizeSignal);
};

export const forecastSurfaceFromPlan = <TSignals extends readonly SurfaceSignal[]>(
  signals: NoInfer<TSignals>,
): Promise<readonly ForecastWindow[]> =>
  defaultScenarioWindow(signals).then((normalized) =>
    normalized.map((signal, index) =>
      buildForecastWindow([signal], WINDOW_STEPS[Math.min(index, WINDOW_STEPS.length - 1)] ?? 4),
    ),
  );

export const forecastSignalsByLane = <
  TLane extends LabLane,
  TSignals extends readonly SurfaceSignal[],
>(
  lane: TLane,
  signals: NoInfer<TSignals>,
): readonly SurfaceSignal[] =>
  signals.filter((entry): entry is SurfaceSignal => entry.lane === lane).toSorted((left, right) => right.value - left.value);

export const combineForecasts = (...forecasts: readonly ForecastTrace[]): ForecastSummary => {
  const tenant = forecasts.at(0)?.route.split('::')[1] ?? 'tenant:unknown';
  const totalWindows = forecasts.flatMap((entry) => entry.windows);
  const topSignals = forecasts
    .flatMap((entry) => entry.windows)
    .map((window) => [`window:${window.mean}`, window.max - window.min] as [string, number])
    .toSorted((left, right) => right[1] - left[1]);

  return {
    tenant,
    scenarios: forecasts.length,
    windows: totalWindows,
    topSignals,
  };
};
