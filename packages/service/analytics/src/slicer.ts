import { MetricPoint } from './collector';

export const topByValue = (rows: readonly MetricPoint[], limit: number): MetricPoint[] =>
  [...rows].sort((a, b) => b.value - a.value).slice(0, limit);

export const topPerTag = (rows: readonly MetricPoint[], tag: string): MetricPoint[] =>
  rows.filter((row) => row.tags?.[tag] !== undefined);

export const sumByDate = (rows: readonly MetricPoint[]): number => rows.reduce((acc, row) => acc + row.value, 0);

export const quantiles = (rows: readonly number[]): { p50: number; p90: number; p99: number } => {
  const sorted = [...rows].sort((a, b) => a - b);
  const p50 = sorted[Math.floor((sorted.length - 1) * 0.5)] ?? 0;
  const p90 = sorted[Math.floor((sorted.length - 1) * 0.9)] ?? 0;
  const p99 = sorted[Math.floor((sorted.length - 1) * 0.99)] ?? 0;
  return { p50, p90, p99 };
};

export const sample = (rows: readonly MetricPoint[], seed = 1): MetricPoint[] => {
  const out: MetricPoint[] = [];
  for (let i = 0; i < rows.length; i += Math.max(1, seed)) out.push(rows[i]!);
  return out;
};
