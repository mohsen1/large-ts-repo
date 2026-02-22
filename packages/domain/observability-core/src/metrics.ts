export interface MetricPoint {
  key: string;
  value: number;
  unit: string;
  at: number;
  labels: Record<string, string>;
}

export interface TimeSeries {
  key: string;
  points: MetricPoint[];
}

export interface MetricNamespace {
  name: string;
  gauges: Map<string, number>;
  counters: Map<string, number>;
  timeseries: Map<string, TimeSeries>;
}

export function newNamespace(name: string): MetricNamespace {
  return { name, gauges: new Map(), counters: new Map(), timeseries: new Map() };
}

export function setGauge(ns: MetricNamespace, name: string, value: number, labels: Record<string, string> = {}): void {
  ns.gauges.set(name, value);
  const key = formatKey(name, labels);
  const series = ns.timeseries.get(key) ?? { key, points: [] };
  series.points.push({ key, value, at: Date.now(), unit: '1', labels });
  ns.timeseries.set(key, series);
}

export function incCounter(ns: MetricNamespace, name: string, delta = 1, labels: Record<string, string> = {}): number {
  const key = formatKey(name, labels);
  const value = ns.counters.get(key) ?? 0;
  ns.counters.set(key, value + delta);
  return value + delta;
}

export function snapshot(ns: MetricNamespace): ReadonlyArray<MetricPoint> {
  const out: MetricPoint[] = [];
  for (const [key, value] of ns.gauges) {
    out.push({ key, value, unit: 'gauge', at: Date.now(), labels: {} });
  }
  for (const [key, value] of ns.counters) {
    out.push({ key, value, unit: 'counter', at: Date.now(), labels: {} });
  }
  return out;
}

function formatKey(name: string, labels: Record<string, string>): string {
  const parts = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`);
  return `${name}{${parts.join(',')}}`;
}
