import type {
  ConvergenceHealth,
  ConvergencePluginId,
  ConvergencePhase,
  ConvergenceRunEvent,
  ConvergenceRunId,
} from './types';

export type ConvergenceMetricName =
  | 'latency'
  | 'throughput'
  | 'errorRate'
  | 'stability'
  | 'coverage'
  | 'pluginSkew'
  | `custom:${string}`;

export type MetricValue = {
  readonly value: number;
  readonly unit: string;
  readonly at: string;
};

export type MetricBuckets<T extends string> = {
  readonly [K in T as `metric_${K}`]: MetricValue;
};

export type TelemetryEnvelope<TLabel extends string, TPayload extends object> = {
  readonly runId: ConvergenceRunId;
  readonly label: TLabel;
  readonly payload: TPayload;
  readonly at: string;
};

export interface RunTelemetryEvent {
  readonly id: ConvergenceRunId;
  readonly phase: ConvergencePhase;
  readonly health: ConvergenceHealth;
  readonly startedAt: string;
  readonly pluginTrace: readonly ConvergencePluginId[];
}

export interface PluginTelemetryEvent {
  readonly phase: ConvergencePhase;
  readonly plugin: ConvergencePluginId;
  readonly startedAt: string;
  readonly elapsedMs: number;
  readonly phaseCount: number;
}

export interface TelemetrySummary<TBuckets extends Record<string, MetricValue> = Record<string, MetricValue>> {
  readonly runId: ConvergenceRunId;
  readonly health: ConvergenceHealth;
  readonly buckets: TBuckets & MetricBuckets<string>;
  readonly events: readonly ConvergenceRunEvent[];
}

export const toMetricRecord = <T extends readonly MetricNameEnvelope[]>(entries: T): Readonly<Record<
  T[number]['key'], T[number]['metric']
>> => Object.fromEntries(entries.map((entry) => [entry.key, entry.metric])) as never;

export type MetricNameEnvelope = {
  readonly key: ConvergenceMetricName;
  readonly metric: MetricValue;
};

export const isCriticalHealth = (health: ConvergenceHealth): boolean => health === 'critical';

export const summarizeRunHealth = (events: readonly ConvergenceRunEvent[]): ReadonlyArray<RunTelemetryEvent> => {
  const sorted = [...events]
    .filter((entry): entry is ConvergenceRunEvent & { runId: ConvergenceRunId; phase?: ConvergencePhase } =>
      Boolean(entry.runId))
    .map((entry) => ({
      id: entry.runId,
      phase: entry.phase ?? 'discover',
      health: 'stable' as ConvergenceHealth,
      startedAt: entry.at,
      pluginTrace: [] as never[] as readonly ConvergencePluginId[],
    }));

  return sorted;
};

export const buildMetricBuckets = <TName extends ConvergenceMetricName>(
  values: Iterable<{ readonly name: TName; readonly value: number; readonly unit: string }>,
): MetricBuckets<TName> => {
  const buckets: Record<string, MetricValue> = {};

  for (const entry of values) {
    const key = `metric_${entry.name}`;
    buckets[key] = {
      value: entry.value,
      unit: entry.unit,
      at: new Date().toISOString(),
    };
  }

  return buckets as MetricBuckets<TName>;
};

export const mergeTelemetry = <TBase extends Record<string, MetricValue>, TAdd extends Record<string, MetricValue>>(
  base: TBase,
  add: TAdd,
): TBase & TAdd => {
  const merged = {
    ...base,
    ...add,
  };
  return merged;
};

export const tracePluginEvent = (
  phase: ConvergencePhase,
  plugin: ConvergencePluginId,
  phaseCount: number,
): PluginTelemetryEvent => ({
  phase,
  plugin,
  startedAt: new Date().toISOString(),
  elapsedMs: phaseCount * 100,
  phaseCount,
});

export const normalizeTelemetryEvents = (entries: readonly ConvergenceRunEvent[]): TelemetrySummary<MetricBuckets<ConvergenceMetricName>> => {
  const metricNames: readonly ConvergenceMetricName[] = ['latency', 'throughput', 'stability', 'errorRate', 'coverage', 'custom:summary'];
  const buckets: Record<string, MetricValue> = entries.reduce<Record<string, MetricValue>>((acc, item, index) => {
    const name = metricNames[index % metricNames.length];
    acc[`metric_${name}`] = {
      value: 100 - index,
      unit: 'score',
      at: item.at,
    };
    return acc;
  }, {});

  return {
    runId: `${Date.now()}` as ConvergenceRunId,
    health: 'stable',
    buckets: buckets as MetricBuckets<ConvergenceMetricName>,
    events: [...entries],
  };
};
