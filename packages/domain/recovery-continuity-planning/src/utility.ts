import type { Brand, ReadonlyDeep } from '@shared/core';
import type { NumericRange } from './types';

export const normalizePriorityWeight = (weight: number): number => {
  if (!Number.isFinite(weight) || Number.isNaN(weight)) return 0;
  if (weight <= 0) return 0;
  if (weight >= 1) return 1;
  return Number(weight.toFixed(4));
};

export const combineWeights = (...weights: readonly number[]): number => {
  if (!weights.length) return 0;

  const normalized = weights
    .map((weight) => normalizePriorityWeight(weight))
    .map((weight) => Math.max(0, weight));

  const aggregated = normalized.reduce((sum, weight) => sum + weight, 0);
  return normalizePriorityWeight(aggregated);
};

export const toBracketRange = (value: number, brackets: readonly NumericRange<number>[]): NumericRange<number> => {
  for (const [min, max] of brackets) {
    if (value >= min && value < max) return [min, max];
  }
  return [0, 0];
};

export const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

export const distinctBrands = <T extends Brand<string, string>>(input: readonly T[]): readonly T[] => {
  const seen = new Set<string>();
  const output: T[] = [];

  for (const value of input) {
    const key = String(value);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }

  return output;
};

export const sortByDependencyDepth = <T extends { dependencies: readonly { dependsOn: string }[] }>(
  artifacts: readonly T[],
): readonly T[] => {
  const sorted = [...artifacts];

  sorted.sort((left, right) => left.dependencies.length - right.dependencies.length);
  return sorted;
};

export const partitionByPriority = <T, K extends string | number>(
  rows: readonly T[],
  selector: (row: T) => K,
): Readonly<Record<string, readonly T[]>> => {
  const buckets = new Map<K, T[]>();

  for (const row of rows) {
    const key = selector(row);
    const bucket = buckets.get(key) ?? [];
    bucket.push(row);
    buckets.set(key, bucket);
  }

  const out: Record<string, readonly T[]> = {};
  for (const [key, value] of buckets) {
    out[String(key)] = value;
  }

  return out;
};

export const toReadOnly = <T>(value: T): ReadonlyDeep<T> => {
  return value as ReadonlyDeep<T>;
};
