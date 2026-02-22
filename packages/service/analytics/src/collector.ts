import { OrderEvent } from '@domain/orders';
import { Money } from '@domain/billing';

export interface MetricPoint {
  at: string;
  key: string;
  value: number;
  tags?: Record<string, string>;
}

export interface Window {
  from: string;
  to: string;
  points: MetricPoint[];
}

export const byState = (events: readonly OrderEvent[]): Record<string, number> => {
  const buckets: Record<string, number> = {};
  for (const event of events) buckets[event.kind] = (buckets[event.kind] ?? 0) + 1;
  return buckets;
};

export const amountSeries = (events: readonly { id: string; amount: Money }[]): readonly MetricPoint[] => {
  return events.map((entry) => ({
    at: new Date().toISOString(),
    key: entry.id,
    value: entry.amount.amount,
    tags: { currency: entry.amount.currency },
  }));
};

export const rolling = (points: readonly MetricPoint[], bucketMs: number): Window[] => {
  const sorted = [...points].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const out: Window[] = [];
  const index = new Map<string, Window>();
  for (const point of sorted) {
    const bucket = `${Math.floor(Date.parse(point.at) / bucketMs) * bucketMs}`;
    let window = index.get(bucket);
    if (!window) {
      window = { from: new Date(Number(bucket)).toISOString(), to: new Date(Number(bucket) + bucketMs).toISOString(), points: [] };
      index.set(bucket, window);
      out.push(window);
    }
    window.points.push(point);
  }
  return out;
};
