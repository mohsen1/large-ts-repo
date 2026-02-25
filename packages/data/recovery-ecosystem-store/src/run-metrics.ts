import { asHealthScore, asRunId, type EcosystemMetric } from '@domain/recovery-ecosystem-core';
import type { JsonValue } from '@shared/type-level';
import type { EcosystemAuditEvent, EcosystemStorePort } from './store-contract';

type MetricValue = EcosystemMetric & { readonly value: number; readonly unit: string; readonly labels: Record<string, string> };

type MetricAccumulator = {
  readonly namespace: `namespace:${string}`;
  readonly metric: `metric:${string}`;
  readonly points: readonly MetricPoint[];
  readonly score: ReturnType<typeof asHealthScore>;
};

export interface MetricPoint<TPayload extends JsonValue = JsonValue> {
  readonly at: string;
  readonly name: `metric:${string}`;
  readonly value: number;
  readonly payload: TPayload;
}

export interface MetricSeries<TValues extends readonly MetricPoint[] = readonly MetricPoint[]> {
  readonly metric: `metric:${string}`;
  readonly points: TValues;
  readonly score: ReturnType<typeof asHealthScore>;
}

export interface MetricsDigest {
  readonly namespace: string;
  readonly totalPoints: number;
  readonly metricCount: number;
  readonly trend: 'up' | 'flat' | 'down';
}

const normalizeLabels = (value: unknown): Record<string, string> =>
  value && typeof value === 'object'
    ? Object.fromEntries(
      Object.entries(value as Record<string, string>).map(([key, current]) => [key, String(current)]),
    )
    : {};

const metricName = (name: string): `metric:${string}` =>
  (name.startsWith('metric:') ? name : `metric:${name}`) as `metric:${string}`;

const isMetric = (value: unknown): value is EcosystemMetric => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const typed = value as Record<string, unknown>;
  return (
    typeof typed.name === 'string' &&
    typeof typed.value === 'number' &&
    typeof typed.unit === 'string' &&
    typeof typed.labels === 'object'
  );
};

const normalizeMetricPayload = (payload: unknown): readonly EcosystemMetric[] => {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const candidate = (payload as { readonly metrics?: unknown }).metrics;
  if (!Array.isArray(candidate)) {
    return [];
  }
  return candidate.filter(isMetric);
};

const trendOf = (values: readonly number[]): 'up' | 'flat' | 'down' => {
  if (values.length < 2) {
    return 'flat';
  }
  const first = values.at(0) ?? 0;
  const last = values.at(-1) ?? first;
  if (last > first) {
    return 'up';
  }
  if (last < first) {
    return 'down';
  }
  return 'flat';
};

type MetricSeedPoint = Omit<MetricPoint, 'payload'> & {
  readonly source: string;
  readonly unit: string;
  readonly labels: Readonly<Record<string, string>>;
};

const metricPoints = (metrics: readonly MetricSeedPoint[]): readonly MetricPoint[] =>
  metrics.toSorted((left, right) => left.name.localeCompare(right.name)).map((value, index) => ({
    at: new Date(Date.now() - (metrics.length - index) * 10_000).toISOString(),
    name: value.name,
    value: value.value,
    payload: {
      source: value.source,
      unit: value.unit,
      labels: value.labels,
      value: value.value,
    },
  }));

const accumulate = (points: readonly MetricPoint[]) =>
  points.reduce(
    (acc, point) => {
      const key = point.name;
      const current = acc.get(key) ?? [];
      acc.set(key, [...current, point]);
      return acc;
    },
    new Map<string, MetricPoint[]>(),
  );

const toDigestValue = (points: readonly MetricPoint[]): ReturnType<typeof asHealthScore> => {
  const values = points.map((point) => point.value);
  const average = values.reduce((acc, value) => acc + value, 0) / Math.max(1, values.length);
  return asHealthScore(average);
};

export class EcosystemMetricsCollector {
  readonly #store: EcosystemStorePort;
  readonly #state = new Map<string, MetricAccumulator>();

  public constructor(store: EcosystemStorePort) {
    this.#store = store;
  }

  public async inspect(namespace: `namespace:${string}`): Promise<readonly MetricSeries[]> {
    const snapshots = await this.#store.query(namespace);
    const events = await this.#collectEvents(namespace, snapshots);

    const accumulator = new Map<string, MetricSeedPoint[]>();

    for (const snapshot of snapshots) {
      const payloadMetrics = normalizeMetricPayload(snapshot.payload);
      for (const metric of payloadMetrics) {
        const name = metricName(metric.name);
        const point: MetricSeedPoint = {
          at: snapshot.generatedAt,
          name,
          value: metric.value,
          source: 'snapshot',
          unit: metric.unit,
          labels: {
            ...normalizeLabels(metric.labels),
            tenant: snapshot.tenant,
            namespace: snapshot.namespace,
          },
        };
        accumulator.set(name, [...(accumulator.get(name) ?? []), point]);
      }
    }

    for (const event of events) {
      const eventMetrics = normalizeMetricPayload(event.payload);
      for (const metric of eventMetrics) {
        const name = metricName(metric.name);
        const point: MetricSeedPoint = {
          at: event.at,
          name,
          value: metric.value,
          source: event.event,
          unit: metric.unit,
          labels: {
            ...normalizeLabels(metric.labels),
            namespace: event.namespace,
            tenant: event.tenant,
            runId: event.runId,
          },
        };
        accumulator.set(name, [...(accumulator.get(name) ?? []), point]);
      }
    }

    return Array.from(accumulator.entries())
      .map(([metric, points]) => ({
        metric,
        points: metricPoints(
          [...points]
            .toSorted((left, right) => left.at.localeCompare(right.at))
            .map((entry) => ({
              at: entry.at,
              name: entry.name,
              value: entry.value,
              source: entry.source,
              unit: entry.unit,
              labels: entry.labels,
            })),
        ),
        score: toDigestValue(
          metricPoints(
            [...points]
              .toSorted((left, right) => left.at.localeCompare(right.at))
              .map((entry) => ({
                at: entry.at,
                name: entry.name,
                value: entry.value,
                source: entry.source,
                unit: entry.unit,
                labels: entry.labels,
              })),
          ),
        ),
      }))
      .map((entry) => entry as MetricSeries)
      .toSorted((left, right) => right.points.length - left.points.length);
  }

  public async digest(namespace: `namespace:${string}`): Promise<MetricsDigest> {
    const rows = await this.inspect(namespace);
    const points = rows.flatMap((row) => row.points);
    const values = points.map((point) => point.value);
    return {
      namespace,
      totalPoints: points.length,
      metricCount: rows.length,
      trend: trendOf(values),
    };
  }

  public async *stream(
    namespace: `namespace:${string}`,
    metricName: `metric:${string}`,
  ): AsyncIterable<MetricPoint[]> {
    const series = await this.inspect(namespace);
    const selected = series.find((entry) => entry.metric === metricName);
    if (!selected) {
      return;
    }

    const ordered = selected.points.toSorted((left, right) => left.at.localeCompare(right.at));
    for (let index = 0; index < ordered.length; index += 16) {
      yield ordered.slice(index, index + 16);
    }
  }

  public async track(namespace: `namespace:${string}`): Promise<Readonly<Map<string, MetricAccumulator>>> {
    const snapshots = await this.#store.query(namespace);
    for (const snapshot of snapshots) {
      const point: MetricAccumulator = {
        namespace: snapshot.namespace,
        metric: `metric:summary:${snapshot.runId}`,
        points: [],
        score: asHealthScore(0),
      };
      this.#state.set(String(snapshot.runId), point);
      this.#state.set(point.metric, point);
    }
    return this.#state;
  }

  async #collectEvents(
    namespace: `namespace:${string}`,
    snapshots: readonly { readonly runId: string }[],
  ): Promise<readonly EcosystemAuditEvent[]> {
    const normalized = await Promise.all(
      snapshots.map((snapshot) => this.#store.read(asRunId(snapshot.runId))),
    );
    const output: EcosystemAuditEvent[] = [];
    for (const stream of normalized) {
      for await (const event of stream) {
        if (event.namespace === namespace) {
          output.push(event);
        }
      }
    }
    return output.toSorted((left, right) => left.at.localeCompare(right.at));
  }
}

export const summarizeByNamespace = (
  values: readonly EcosystemAuditEvent[],
): Record<string, readonly EcosystemMetric[]> => {
  const grouped = new Map<string, EcosystemMetric[]>();
  for (const value of values) {
    for (const metric of normalizeMetricPayload(value.payload)) {
      const output = grouped.get(value.namespace) ?? [];
      output.push(metric);
      grouped.set(value.namespace, output);
    }
  }

  const normalized = Object.fromEntries(grouped.entries()) as Record<string, readonly EcosystemMetric[]>;
  return normalized;
};
