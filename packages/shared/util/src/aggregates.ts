export type Group<T> = {
  readonly key: string;
  readonly values: readonly T[];
};

export const normalizeNumber = (value: number): number => Number(value.toFixed(4));

export const toPercent = (value: number, total: number): number => {
  if (total <= 0) return 0;
  return normalizeNumber((value / total) * 100);
};

export const clamp = (value: number, min: number, max: number): number => {
  if (Number.isNaN(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

export const cumulativeSum = (values: readonly number[]): readonly number[] => {
  let total = 0;
  return values.map((value) => {
    total += value;
    return total;
  });
};

export const movingAverage = (values: readonly number[], window = 3): readonly number[] => {
  if (window <= 0) {
    return values;
  }

  return values.map((_, index) => {
    const start = Math.max(0, index - window + 1);
    const slice = values.slice(start, index + 1);
    const sum = slice.reduce((acc, value) => acc + value, 0);
    return normalizeNumber(sum / slice.length);
  });
};

export const percentile = (values: readonly number[], ratio: number): number => {
  if (values.length === 0) return 0;
  if (ratio <= 0) return Math.min(...values);
  if (ratio >= 1) return Math.max(...values);

  const sorted = [...values].sort((left, right) => left - right);
  const value = (sorted.length - 1) * ratio;
  const before = Math.floor(value);
  const after = Math.ceil(value);
  if (before === after) {
    return normalizeNumber(sorted[before] ?? 0);
  }

  const weight = value - before;
  const left = sorted[before] ?? 0;
  const right = sorted[after] ?? left;
  return normalizeNumber(left + (right - left) * weight);
};

export const groupBy = <T, K>(values: readonly T[], selector: (value: T) => K): readonly Group<T>[] => {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const key = String(selector(value));
    const current = groups.get(key);
    if (current) {
      current.push(value);
    } else {
      groups.set(key, [value]);
    }
  }

  return [...groups.entries()].map(([key, list]) => ({ key, values: list }));
};

export const rankByScore = <T>(values: readonly T[], score: (value: T) => number): readonly T[] =>
  [...values].sort((left, right) => score(right) - score(left));

export const partition = <T>(items: readonly T[], predicate: (value: T) => boolean): [readonly T[], readonly T[]] => {
  const left: T[] = [];
  const right: T[] = [];
  for (const item of items) {
    if (predicate(item)) {
      left.push(item);
    } else {
      right.push(item);
    }
  }
  return [left, right];
};

export const pairwiseDifferences = (values: readonly number[]): readonly number[] => {
  if (values.length === 0) return [];
  const [first, ...rest] = values;
  let previous = first;
  const deltas: number[] = [];
  for (const current of rest) {
    deltas.push(normalizeNumber(current - previous));
    previous = current;
  }
  return deltas;
};

export const mapToSeries = <T, K>(items: readonly T[], mapper: (item: T) => K): readonly K[] => items.map(mapper);

export const zipByKey = <K extends string>(left: readonly { id: K }[], right: readonly { id: K }[]): readonly { id: K }[] =>
  left.filter((candidate) => right.some((other) => other.id === candidate.id));

export const rollingWindow = <T>(items: readonly T[], size: number): readonly (readonly T[])[] => {
  if (size <= 0) return [];
  const windows: T[][] = [];
  for (let index = 0; index < items.length; index += 1) {
    const start = Math.max(0, index - size + 1);
    windows.push([...items.slice(start, index + 1)]);
  }
  return windows;
};

export const weightedAverage = (values: readonly { value: number; weight: number }[]): number => {
  const totalWeight = values.reduce((acc, value) => acc + value.weight, 0);
  if (totalWeight === 0) return 0;
  const weighted = values.reduce((acc, value) => acc + value.value * value.weight, 0);
  return normalizeNumber(weighted / totalWeight);
};

export const compact = <T>(values: readonly (T | null | undefined | false | 0 | '')[]): readonly T[] =>
  values.filter((value) => Boolean(value)).map((value) => value as T);

export const pickByRatio = (left: number, right: number): number => {
  if (right === 0) return 0;
  return normalizeNumber(left / right);
};
