import { toMap } from '@shared/typed-orchestration-core';
import type { MetricRecord, Severity } from './contracts';
import type { LensTopology } from './telemetryGraph';
import { summarizeTopology, routeNodes } from './telemetryGraph';

export type SeverityBuckets = {
  critical: number;
  error: number;
  warn: number;
  info: number;
  trace: number;
};

export const severityBuckets = <TPayload extends Record<string, unknown>>(points: readonly MetricRecord<TPayload>[]): SeverityBuckets => {
  const out = { critical: 0, error: 0, warn: 0, info: 0, trace: 0 } as SeverityBuckets;
  for (const point of points) {
    out[point.severity] += 1;
  }
  return out;
};

export const rollingDigest = <TPayload extends Record<string, unknown>>(points: readonly MetricRecord<TPayload>[]) => {
  const buckets = severityBuckets(points);
  return {
    total: points.length,
    buckets,
    hasCritical: buckets.critical + buckets.error > 0,
    entries: Object.entries(buckets).map(([severity, count]) => ({ severity: severity as Severity, count })),
  };
};

export type RollingDigest = ReturnType<typeof rollingDigest>;

export const mapByMetric = <TPayload extends Record<string, unknown>>(points: readonly MetricRecord<TPayload>[]) => {
  return toMap(points, (point) => point.metric);
};

export const runDigest = <TPayload extends Record<string, unknown>>(topology: LensTopology, points: readonly MetricRecord<TPayload>[]) => ({
  topology: summarizeTopology(topology),
  paths: routeNodes(topology),
  rolling: rollingDigest(points),
});

export const digestTopology = (topology: LensTopology) => summarizeTopology(topology);
