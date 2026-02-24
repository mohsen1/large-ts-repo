import { type Brand, withBrand } from '@shared/core';
import { NoInfer } from '@shared/type-level';
import { asRouteId, type LatticeContext, type LatticeTenantId } from './ids';
import type { LatticeBlueprintManifest } from './blueprints';

export type MetricUnit = 'ms' | 'count' | 'ratio' | 'bytes' | 'percent';
export type MetricSeverity = 'critical' | 'warning' | 'stable' | 'info';

export type MetricId<TName extends string = string> = Brand<string, `metric:${TName}`>;
export type MetricBucketKey = `${MetricUnit}:${number}`;
export type MetricValue<T extends MetricUnit> =
  T extends 'ms' | 'count' | 'percent' ? number : T extends 'bytes' ? bigint : number;

export interface LatticeMetricSample<TContext extends object = Record<string, unknown>> {
  readonly tenantId: LatticeTenantId;
  readonly timestamp: Brand<string, 'lattice-timestamp'>;
  readonly name: MetricId;
  readonly unit: MetricUnit;
  readonly value: number;
  readonly severity: MetricSeverity;
  readonly context: NoInfer<TContext>;
  readonly tags: readonly string[];
}

export interface MetricBucketConfig {
  readonly maxSamples: number;
  readonly windowMs: number;
  readonly thresholds: readonly number[];
}

export interface LatticeMetricWindow<TContext extends object = Record<string, unknown>> {
  readonly tenantId: LatticeTenantId;
  readonly route: string;
  readonly metric: MetricId;
  readonly unit: MetricUnit;
  readonly samples: readonly LatticeMetricSample<TContext>[];
  readonly buckets: Readonly<Record<MetricBucketKey, number>>;
}

interface MetricWindowState {
  limit: number;
  startedAt: string;
  seen: number;
  windowMs: number;
}

export type MetricFormatter<TContext extends object> = (
  sample: LatticeMetricSample<TContext>,
) => string;
export type MetricFilter<TContext extends object> = (
  sample: LatticeMetricSample<TContext>,
) => boolean;

export interface MetricCollector<TContext extends object = Record<string, unknown>> {
  record(sample: LatticeMetricSample<TContext>): void;
  snapshot(context?: MetricFilter<TContext>): LatticeMetricWindow<TContext>;
  [Symbol.asyncDispose](): Promise<void>;
}

export type MetricTuple<T extends readonly LatticeMetricSample<object>[]> =
  T extends readonly [infer Head extends LatticeMetricSample<object>, ...infer Tail extends readonly LatticeMetricSample<object>[]]
    ? readonly [Head, ...MetricTuple<Tail>]
    : readonly [];

export const metricProfiles = (() => [
  {
    unit: 'ms',
    thresholds: [50, 120, 300],
    label: 'latency',
    severity: 'warning' as const,
  },
  {
    unit: 'count',
    thresholds: [10, 100, 400],
    label: 'event-rate',
    severity: 'stable' as const,
  },
  {
    unit: 'ratio',
    thresholds: [0.2, 0.5, 0.9],
    label: 'success',
    severity: 'critical' as const,
  },
] as const);

const getAsyncStack = (): {
  new (): {
    use<T extends object>(resource: T & { [Symbol.asyncDispose]?: () => PromiseLike<void> }): T;
    [Symbol.asyncDispose](): Promise<void>;
  };
} => {
  const fallback = class {
    readonly #dispose: Array<() => void | PromiseLike<void>> = [];

    use<T>(resource: T & { [Symbol.asyncDispose]?: () => PromiseLike<void> }): T {
      const disposer = resource?.[Symbol.asyncDispose];
      if (typeof disposer === 'function') {
        this.#dispose.push(() => Promise.resolve(disposer.call(resource)));
      }
      return resource;
    }

    async [Symbol.asyncDispose](): Promise<void> {
      while (this.#dispose.length > 0) {
        const pop = this.#dispose.pop();
        if (pop) {
          await pop();
        }
      }
    }
  };

  return (
    (globalThis as { AsyncDisposableStack?: { new (): {
      use<T extends object>(resource: T & { [Symbol.asyncDispose]?: () => PromiseLike<void> }): T;
      [Symbol.asyncDispose](): Promise<void>;
    } } }).AsyncDisposableStack ?? fallback
  );
};

const defaultBucketSeed = (unit: MetricUnit, thresholds: readonly number[]): Record<MetricBucketKey, number> => {
  const buckets: Record<string, number> = {};
  for (let index = 0; index < thresholds.length; index += 1) {
    buckets[`${unit}:${index}`] = 0;
  }
  return buckets as Record<MetricBucketKey, number>;
};

const clamp = (value: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(max, value));
};

export const makeMetricId = (tenantId: LatticeTenantId, suffix: string): MetricId => {
  return withBrand(`metric:${tenantId}:${suffix}`, `metric:${tenantId}:${suffix}` as `metric:${string}`);
};

export const createCollector = <
  TContext extends object = Record<string, unknown>,
>(
  tenantId: LatticeTenantId,
  route: string,
  metric: MetricId,
  config: MetricBucketConfig,
): MetricCollector<TContext> => {
  let samples: LatticeMetricSample<TContext>[] = [];
  const buckets: Record<MetricBucketKey, number> = {
    ...defaultBucketSeed('ms', config.thresholds),
  };
  const state: MetricWindowState = {
    limit: clamp(config.maxSamples, 1_000),
    windowMs: config.windowMs,
    startedAt: new Date().toISOString(),
    seen: 0,
  };

  const updateBucket = (sample: LatticeMetricSample<TContext>): void => {
    const thresholdIndex = config.thresholds.findIndex((boundary) => Number(sample.value) <= boundary);
    const bucket = `${sample.unit}:${Math.max(0, thresholdIndex + 1)}` as MetricBucketKey;
    buckets[bucket] = (buckets[bucket] ?? 0) + 1;
  };

  return {
    record(sample: LatticeMetricSample<TContext>): void {
      const timestamp = Number.isNaN(new Date(sample.timestamp).getTime())
        ? withBrand(new Date().toISOString(), 'lattice-timestamp')
        : sample.timestamp;

      const normalized: LatticeMetricSample<TContext> = {
        ...sample,
        tenantId,
        timestamp,
        value: Number.isFinite(sample.value) ? sample.value : 0,
      };

      samples = [...samples, normalized].slice(-state.limit);
      updateBucket(normalized);
      state.seen += 1;
    },
    snapshot(filter?: MetricFilter<TContext>): LatticeMetricWindow<TContext> {
      const selected = filter ? samples.filter(filter) : samples;
      return {
        tenantId,
        route: asRouteId(route),
        metric,
        unit: selected[0]?.unit ?? 'ms',
        samples: selected,
        buckets: { ...buckets },
      };
    },
    async [Symbol.asyncDispose](): Promise<void> {
      samples = [];
      state.seen = 0;
    },
  };
};

export const metricAsString = <TContext extends object>(
  sample: LatticeMetricSample<TContext>,
  formatter: MetricFormatter<TContext> = (entry) => `${entry.name}:${entry.value} ${entry.unit}`,
): string => {
  const severity = sample.severity.toUpperCase().padEnd(8, '.');
  return `${severity} ${formatter(sample)}`;
};

export const metricSummary = <TContext extends object>(
  context: LatticeContext,
  window: LatticeMetricWindow<TContext>,
  filter?: MetricFilter<TContext>,
): string => {
  const sampleCount = filter ? window.samples.filter(filter).length : window.samples.length;
  return `${context.tenantId}::${window.route}::${window.metric}::${sampleCount}::${window.unit}`;
};

export const attachTag = (sample: LatticeMetricSample, tag: string): LatticeMetricSample => ({
  ...sample,
  tags: Array.from(new Set([...sample.tags, tag])),
});

export const normalizeSeverity = (value: string): MetricSeverity => {
  if (value === 'critical') return 'critical';
  if (value === 'warning') return 'warning';
  if (value === 'stable') return 'stable';
  return 'info';
};

export const collectBlueprintMetrics = async <
  TContext extends object,
  TBlueprint extends LatticeBlueprintManifest,
>(
  context: LatticeContext,
  blueprint: TBlueprint,
  source: Iterable<LatticeMetricSample<TContext>>,
): Promise<readonly string[]> => {
  const iteratorFrom = (globalThis as {
    Iterator?: {
      from?: <T>(value: Iterable<T>) => IterableIterator<T>;
    };
  }).Iterator?.from;
  const samples = iteratorFrom ? Array.from(iteratorFrom(source)) : [...source];
  const tenantSamples = samples.filter((entry) => entry.tenantId === context.tenantId);
  const route = `${context.tenantId}/${blueprint.name}`;

  return tenantSamples.map((entry) =>
    metricSummary(context, {
      tenantId: context.tenantId,
      route: String(asRouteId(route)),
      metric: entry.name,
      unit: entry.unit,
      samples: [entry],
      buckets: {
        [`${entry.unit}:0`]: 1,
      } as Readonly<Record<MetricBucketKey, number>>,
    }),
  );
};

export const withCollector = async <
  TContext extends object,
  TOutput,
>(
  tenantId: LatticeTenantId,
  route: string,
  metric: MetricId,
  config: MetricBucketConfig,
  handler: (collector: MetricCollector<TContext>) => Promise<TOutput>,
): Promise<TOutput> => {
  const AsyncDisposableStack = getAsyncStack();
  const AsyncStack = new AsyncDisposableStack();
  await using stack = AsyncStack;
  const collector = createCollector<TContext>(tenantId, route, metric, config);
  stack.use(collector);
  return handler(collector);
};

export const isCriticalLoad = (
  sample: LatticeMetricSample,
): sample is LatticeMetricSample & { readonly severity: 'critical' } => sample.severity === 'critical';
