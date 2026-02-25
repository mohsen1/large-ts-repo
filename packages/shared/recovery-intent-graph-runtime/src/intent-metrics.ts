import { iteratorChain } from '@shared/recovery-workbench-runtime';
import { createAsyncScope } from '@shared/recovery-workbench-runtime';

export type MetricWindow = {
  readonly startAt: number;
  readonly endAt: number;
};

export interface MetricBucket {
  readonly route: string;
  readonly key: string;
  readonly hits: number;
  readonly weighted: number;
}

export interface MetricEnvelope {
  readonly tenant: string;
  readonly workspace: string;
  readonly timestamp: number;
  readonly route: string;
  readonly latencyMs: number;
  readonly routeScore: number;
}

export type MetricMap = Readonly<Record<string, number>>;

type MetricReducer = (acc: number, value: number, index: number) => number;

const clampToWindow = (value: number): number => Math.max(0, Math.min(1, value));

const computeWeight = (latencyMs: number): number => {
  if (latencyMs <= 0) return 1;
  return clampToWindow(1 - latencyMs / 10_000);
};

export class IntentMetricRegistry {
  readonly #items: MetricEnvelope[] = [];
  readonly #labels: Set<string> = new Set();

  add(envelope: MetricEnvelope): void {
    this.#items.push(envelope);
    this.#labels.add(envelope.route);
  }

  routes(): readonly string[] {
    return [...this.#labels];
  }

  byRoute(route: string): readonly MetricEnvelope[] {
    return iteratorChain(this.#items).filter((item) => item.route === route).toArray();
  }

  reduceRoute(route: string, seed: number, reducer: MetricReducer): number {
    return iteratorChain(this.byRoute(route)).reduce((acc, item, index) => reducer(acc, item.latencyMs, index), seed);
  }

  summarizeRoute(route: string): MetricBucket {
    const buckets = iteratorChain(this.byRoute(route))
      .map((item) => ({
        route: item.route,
        key: `${item.tenant}:${item.workspace}`,
        hits: 1,
        weighted: computeWeight(item.latencyMs),
      }))
      .toArray();

    return {
      route,
      key: route,
      hits: buckets.reduce((acc, bucket) => acc + bucket.hits, 0),
      weighted: buckets.reduce((acc, bucket) => acc + bucket.weighted, 0),
    };
  }

  histogram(fromMs: number, toMs: number): readonly MetricBucket[] {
    const scope = createAsyncScope();
    using _scope = scope;
    const relevant = iteratorChain(this.#items)
      .filter((metric) => metric.timestamp >= fromMs && metric.timestamp <= toMs)
      .toArray();
    scope.adopt({ fromMs, toMs }, () => {});
    return iteratorChain(relevant).map((metric) => this.summarizeRoute(metric.route)).toArray();
  }

  percentile(pct: number): number {
    const normalizedPct = clampToWindow(pct / 100);
    const sorted = iteratorChain(this.#items)
      .map((item) => item.latencyMs)
      .toArray()
      .slice()
      .sort((a, b) => a - b);

    if (sorted.length === 0) return 0;
    const index = Math.floor((sorted.length - 1) * normalizedPct);
    return sorted[index] ?? 0;
  }
}

export const summarizeByRoute = (metrics: readonly MetricEnvelope[]): MetricMap =>
  iteratorChain(metrics).reduce((accumulator: Record<string, number>, metric) => {
    accumulator[metric.route] = (accumulator[metric.route] ?? 0) + 1;
    return accumulator;
  }, {});

export const topRoutes = (metrics: readonly MetricEnvelope[], limit = 3): readonly [string, number][] => {
  const grouped = summarizeByRoute(metrics);
  return Object.entries(grouped)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit) as readonly [string, number][];
};
