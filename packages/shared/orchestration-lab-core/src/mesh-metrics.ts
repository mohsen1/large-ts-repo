export type StatBucket<TName extends string = string> = {
  readonly name: `bucket:${TName}`;
  readonly min: number;
  readonly max: number;
  readonly p50: number;
  readonly p90: number;
  readonly p99: number;
};

export type NumericSeries<TLabel extends string = string> = Readonly<{
  readonly label: TLabel;
  readonly values: readonly number[];
}>;

export type SeriesTuple<T extends readonly number[]> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends number
    ? readonly [Head, ...SeriesTuple<Tail & readonly number[]>]
    : readonly []
  : readonly [];

export type BucketByLabel<T extends readonly NumericSeries[]> = {
  [K in T[number] as K['label']]: K['values'];
};

export const measureSeries = (values: Iterable<number>): readonly number[] => {
  const normalized = Array.from(values).map((value) => Number(value)).filter((value) => Number.isFinite(value));
  return normalized.toSorted((left, right) => left - right);
}

export const percentile = (values: readonly number[], ratio: number): number => {
  if (values.length === 0) {
    return 0;
  }
  const safe = Math.max(0, Math.min(0.999, ratio));
  const sorted = values.toSorted((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.floor(safe * (sorted.length - 1)));
  return sorted[index] ?? 0;
};

export const variance = (values: readonly number[]): number => {
  if (values.length < 2) {
    return 0;
  }

  const average = values.reduce((acc, value) => acc + value, 0) / values.length;
  const sum = values.reduce((acc, value) => acc + (value - average) ** 2, 0);
  return Number((sum / values.length).toFixed(4));
};

export const standardDeviation = (values: readonly number[]): number => Math.sqrt(variance(values));

export const bucketFromValues = <TLabel extends string>(
  label: TLabel,
  values: readonly number[],
): StatBucket<TLabel> => {
  const sorted = measureSeries(values);
  return {
    name: `bucket:${label}`,
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    p99: percentile(sorted, 0.99),
  };
};

export const makeBuckets = <TEntries extends readonly NumericSeries[]>(entries: TEntries): BucketByLabel<TEntries> => {
  const output = {} as Record<string, readonly number[]>;
  for (const entry of entries) {
    const bucket = bucketFromValues(entry.label, entry.values);
    output[`bucket:${entry.label}`] = entry.values;
  }
  return output as BucketByLabel<TEntries>;
};

export const mergeBuckets = <TName extends string>(
  left: Readonly<Record<`bucket:${TName}`, readonly number[]>>,
  right: Readonly<Record<`bucket:${TName}`, readonly number[]>>,
): Readonly<Record<`bucket:${TName}`, readonly number[]>> => {
  const merged = { ...left } as Record<`bucket:${TName}`, number[]>;
  for (const [key, values] of Object.entries(right) as Array<[`bucket:${TName}`, readonly number[]]>) {
    merged[key] = [...(merged[key] ?? []), ...values];
  }
  return merged as Readonly<Record<`bucket:${TName}`, readonly number[]>>;
};

export const buildTimeSeries = (count: number): readonly number[] =>
  Array.from({ length: Math.max(0, count) }, (_, index) => {
    const normalized = index / Math.max(1, count);
    return Number((Math.sin(normalized * Math.PI) + 1).toFixed(6));
  });

export const summarizeSeries = (series: readonly NumericSeries[]): {
  readonly count: number;
  readonly labels: readonly string[];
  readonly snapshots: readonly StatBucket[];
} => {
  const labels = series.map((item) => item.label);
  const snapshots = series.map((entry) => bucketFromValues(entry.label, entry.values));

  return {
    count: series.length,
    labels,
    snapshots,
  };
};

export const aggregateWeighted = <T extends readonly number[]>(
  values: T,
  weights: T,
): number => {
  if (values.length !== weights.length || values.length === 0) {
    return 0;
  }

  const total = values.reduce((acc, value, index) => acc + value * (weights[index] ?? 0), 0);
  const divisor = weights.reduce((acc, value) => acc + value, 0);
  return Number((total / (divisor === 0 ? 1 : divisor)).toFixed(6));
};

export const quantize = (value: number, precision = 2): string => value.toFixed(precision);
