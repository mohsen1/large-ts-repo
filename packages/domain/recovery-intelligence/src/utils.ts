import type { PriorityBucket } from './types';

export const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));
const now = () => Date.now();

export const roundTo = (value: number, digits = 2): number =>
  Number(value.toFixed(digits));

export const weightedPercentile = (values: readonly number[], percentile: number): number => {
  if (values.length === 0) return 0;
  const p = clamp(percentile, 0, 1);
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) return sorted[low];
  return sorted[low] * (1 - (index - low)) + sorted[high] * (index - low);
};

export const bucketPriority = (score: number): PriorityBucket => {
  if (score >= 0.85) return 'critical';
  if (score >= 0.65) return 'high';
  if (score >= 0.35) return 'medium';
  return 'low';
};

export const isExpiredAt = (isoDate: string): boolean => Date.parse(isoDate) < now();

export const normalizeSeverity = (value: number): number => clamp(Number(value) || 0, 0, 1);

export const buildFingerprint = (source: string, category: string, observedAt: string): string =>
  `${source}#${category}#${observedAt}`.toLowerCase();

export const movingAverage = (values: readonly number[], window: number): readonly number[] => {
  if (window <= 1) return values.map((value) => Number(value));
  const out: number[] = [];
  for (let i = 0; i < values.length; i += 1) {
    const from = Math.max(0, i - window + 1);
    const windowValues = values.slice(from, i + 1);
    const total = windowValues.reduce((sum, value) => sum + value, 0);
    out.push(total / windowValues.length);
  }
  return out;
};
