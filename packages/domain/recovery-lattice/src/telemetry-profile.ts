import { NoInfer } from '@shared/type-level';
import { withBrand } from '@shared/core';
import { type LatticeContext, type LatticeTenantId } from './ids';
import {
  type LatticeMetricSample,
  type MetricId,
  type MetricUnit,
  type MetricBucketKey,
  type LatticeMetricWindow,
} from './observability';

export type ProfileMode = 'steady' | 'burst' | 'drain' | 'replay';
export type BucketMode = 'single' | 'rolling' | 'expanding';

export type ProfileId<TMetric extends string = string> = `profile:${TMetric}:${number}`;
export type BucketId<TMetric extends string = string> = `${TMetric}:${BucketMode}`;

export interface TelemetryProfileDescriptor<
  TName extends string = string,
  TUnit extends MetricUnit = MetricUnit,
> {
  readonly name: TName;
  readonly metric: MetricId;
  readonly unit: TUnit;
  readonly mode: ProfileMode;
  readonly windowMs: number;
  readonly thresholds: readonly number[];
}

export interface TelemetrySampleEnvelope<
  TMetric extends string = string,
  TContext extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly id: ProfileId<TMetric>;
  readonly tenantId: LatticeTenantId;
  readonly metric: MetricId<TMetric>;
  readonly sample: LatticeMetricSample<TContext>;
  readonly tags: Readonly<Record<string, string>>;
}

export type ProfileTagKey = `tag:${string}`;
export type TaggableMap<T extends Record<string, string>> = {
  [K in keyof T as `x:${K & string}`]: T[K];
};

export type RecursiveProfileTuple<TProfiles extends readonly TelemetryProfileDescriptor[]> =
  TProfiles extends readonly [
    infer Head extends TelemetryProfileDescriptor,
    ...infer Tail extends readonly TelemetryProfileDescriptor[],
]
  ? readonly [Head, ...RecursiveProfileTuple<Tail>]
  : readonly [];

export type ProfileMap<
  TProfiles extends readonly TelemetryProfileDescriptor[],
  TMetric extends string,
> = {
  [K in TProfiles[number] as K['name'] & string]: K['metric'];
} & Record<`metric:${TMetric}`, string>;

export interface TelemetryProfileWindow<TContext extends Record<string, unknown> = Record<string, unknown>> {
  readonly profileId: ProfileId;
  readonly tenantId: LatticeTenantId;
  readonly metric: MetricId;
  readonly buckets: Readonly<Record<MetricBucketKey, number>>;
  readonly samples: readonly TelemetrySampleEnvelope<string, TContext>[];
  readonly fingerprint: string;
  readonly windowMs: number;
}

type WindowAccumulator<TContext extends Record<string, unknown>> = {
  samples: readonly TelemetrySampleEnvelope<string, TContext>[];
  buckets: Map<MetricBucketKey, number>;
  seen: number;
};

export type ProfileSummary = {
  readonly profileCount: number;
  readonly sampleCount: number;
  readonly maxSeverity: number;
  readonly activeBuckets: readonly MetricBucketKey[];
};

const clampProfileValue = (value: number, min = 0, max = 1): number => {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
};

const buildWindowBucket = (unit: MetricUnit, thresholds: readonly number[]): Record<MetricBucketKey, number> => {
  const buckets: Record<string, number> = {};
  for (const [index] of thresholds.entries()) {
    buckets[`${unit}:${index}`] = 0;
  }
  buckets[`${unit}:overflow`] = 0;
  return buckets as Readonly<Record<MetricBucketKey, number>>;
};

const toProfileId = (metric: MetricId, unit: MetricUnit): ProfileId => {
  return `profile:${metric}:${unit.replace(/[^a-z]/g, '').length}` as ProfileId;
};

const deriveFingerprint = <TContext extends Record<string, unknown>>(
  samples: readonly TelemetrySampleEnvelope<string, TContext>[],
): string => {
  const parts = samples
    .map((entry) => `${entry.metric}:${entry.sample.value}`)
    .toSorted()
    .slice(0, 16);
  return parts.join('|');
};

const profileSeed = [
  {
    name: 'latency-rollup',
    metric: 'metric:latency' as MetricId,
    unit: 'ms' as const,
    mode: 'steady' as const,
    windowMs: 60_000,
    thresholds: [20, 75, 150],
  },
  {
    name: 'error-rate',
    metric: 'metric:error-rate' as MetricId,
    unit: 'ratio' as const,
    mode: 'burst' as const,
    windowMs: 30_000,
    thresholds: [0.05, 0.2, 0.6],
  },
  {
    name: 'throughput',
    metric: 'metric:throughput' as MetricId,
    unit: 'count' as const,
    mode: 'steady' as const,
    windowMs: 30_000,
    thresholds: [10, 50, 150],
  },
] as const satisfies readonly TelemetryProfileDescriptor[];

export const seedProfiles = (tenantId: LatticeTenantId): readonly TelemetryProfileDescriptor[] => {
  return profileSeed.map((entry) => ({
    ...entry,
    name: `${tenantId}:${entry.name}`,
    metric: `metric:${tenantId}:${entry.metric}` as MetricId,
  }));
};

const normalizeProfileTagKey = (value: string): ProfileTagKey =>
  `tag:${value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;

export const createTelemetryWindow = <
  TContext extends Record<string, unknown>,
  TDescriptor extends TelemetryProfileDescriptor = TelemetryProfileDescriptor,
>(
  tenantId: LatticeTenantId,
  descriptor: NoInfer<TDescriptor>,
  baseSample: LatticeMetricSample<NoInfer<TContext>>,
): TelemetryProfileWindow<TContext> => {
  const profileId = toProfileId(descriptor.metric, descriptor.unit);
  const sample: TelemetrySampleEnvelope<string, TContext> = {
    id: `profile:${tenantId}:${descriptor.metric}:${Date.now()}` as ProfileId,
    tenantId,
    metric: descriptor.metric,
    sample: baseSample,
    tags: {
      [normalizeProfileTagKey('tenant')]: String(tenantId),
      [normalizeProfileTagKey('mode')]: descriptor.mode,
      [normalizeProfileTagKey('unit')]: descriptor.unit,
    },
  };

  const buckets = buildWindowBucket(descriptor.unit, descriptor.thresholds);
  const index = Math.min(descriptor.thresholds.length, Math.floor(baseSample.value));
  const key = `${descriptor.unit}:${Number.isFinite(index) ? Math.max(0, index) : 0}` as MetricBucketKey;
  buckets[key] = (buckets[key] ?? 0) + 1;

  return {
    profileId,
    tenantId,
    metric: descriptor.metric,
    buckets,
    samples: [sample],
    fingerprint: deriveFingerprint([sample]),
    windowMs: descriptor.windowMs,
  };
};

export class LatticeTelemetryProfile<TContext extends Record<string, unknown> = Record<string, unknown>> {
  #accumulator: WindowAccumulator<TContext>;
  #closed = false;

  public constructor(
    private readonly tenantId: LatticeTenantId,
    private readonly descriptor: TelemetryProfileDescriptor,
  ) {
    this.#accumulator = {
      samples: [],
      buckets: new Map<MetricBucketKey, number>(
        Object.entries(buildWindowBucket(this.descriptor.unit, this.descriptor.thresholds)).map(([key, value]) => [
          key as MetricBucketKey,
          value,
        ]),
      ),
      seen: 0,
    };
  }

  public append(
    sample: LatticeMetricSample<NoInfer<TContext>>,
    tags: Readonly<Record<string, string>> = {},
  ): TelemetryProfileWindow<TContext> {
    if (this.#closed) {
      return this.buildWindow(this.#accumulator.samples);
    }

    const base: TelemetrySampleEnvelope<string, TContext> = {
      id: `profile:${this.tenantId}:${sample.name}:${this.#accumulator.seen + 1}` as ProfileId,
      tenantId: this.tenantId,
      metric: sample.name,
      sample: {
        ...sample,
        context: sample.context as TContext,
      },
      tags: {
        ...tags,
        [normalizeProfileTagKey('tenant')]: String(this.tenantId),
        [normalizeProfileTagKey('unit')]: sample.unit,
      },
    };

    this.#accumulator.seen += 1;
      this.#accumulator.samples = [...this.#accumulator.samples, base];
    const bucketIndex = this.#accumulator.samples.length % (this.descriptor.thresholds.length + 1);
    const bucket = `${sample.unit}:${bucketIndex}` as MetricBucketKey;
    this.#accumulator.buckets.set(bucket, (this.#accumulator.buckets.get(bucket) ?? 0) + 1);

    return this.buildWindow(this.#accumulator.samples);
  }

  public buildWindow(
    samples: readonly TelemetrySampleEnvelope<string, TContext>[] = [],
  ): TelemetryProfileWindow<TContext> {
    const selected = samples;
    const bucketRecord = selected.reduce<Record<string, number>>((acc, entry) => {
      const ratio = clampProfileValue(entry.sample.value / Math.max(1, entry.sample.value || 1), 0, 1);
      const score = Math.round(ratio * this.descriptor.thresholds.length);
      const bucket = `${entry.sample.unit}:${score}` as MetricBucketKey;
      acc[bucket] = (acc[bucket] ?? 0) + 1;
      return acc;
    }, buildWindowBucket(this.descriptor.unit, this.descriptor.thresholds) as Record<string, number>);
    const profileId = toProfileId(this.descriptor.metric, this.descriptor.unit);

    return {
      profileId,
      tenantId: this.tenantId,
      metric: this.descriptor.metric,
      buckets: bucketRecord as Readonly<Record<MetricBucketKey, number>>,
      samples: selected,
      fingerprint: deriveFingerprint(selected),
      windowMs: this.descriptor.windowMs,
    };
  }

  public summarize(): ProfileSummary {
    const buckets = this.#accumulator.buckets;
    const sorted = [...buckets.entries()].toSorted((left, right) => left[1] - right[1]);
    return {
      profileCount: buckets.size,
      sampleCount: this.#accumulator.seen,
      maxSeverity: sorted[sorted.length - 1]?.[1] ?? 0,
      activeBuckets: sorted.filter((entry) => entry[1] > 0).map(([bucket]) => bucket),
    };
  }

  public markClosed(): void {
    this.#closed = true;
  }
}

export const flattenProfileWindows = <TContext extends Record<string, unknown>>(
  windows: readonly LatticeMetricWindow<TContext>[],
): string[] => {
  return windows.map((window) => `${window.tenantId}:${window.metric}:${window.route}`);
};

export const mergeProfileWindows = <TContext extends Record<string, unknown>>(
  windows: readonly TelemetryProfileWindow<TContext>[],
): TelemetryProfileWindow<TContext> => {
  const merged = windows.reduce<Record<MetricBucketKey, number>>((acc, window) => {
    for (const [key, value] of Object.entries(window.buckets)) {
      const bucketKey = key as MetricBucketKey;
      acc[bucketKey] = (acc[bucketKey] ?? 0) + value;
    }
    return acc;
  }, {} as Record<MetricBucketKey, number>);

  return {
    profileId: windows[0]?.profileId ?? `profile:merged:${Date.now()}` as ProfileId,
    tenantId: windows[0]?.tenantId ?? withBrand('tenant:default', 'lattice-tenant:id'),
    metric: windows[0]?.metric ?? ('metric:merged' as MetricId),
    buckets: merged as Readonly<Record<MetricBucketKey, number>>,
    samples: windows.flatMap((window) => window.samples),
    fingerprint: windows.map((window) => window.fingerprint).toSorted().join('>'),
    windowMs: windows.reduce((acc, window) => Math.max(acc, window.windowMs), 0),
  };
};
