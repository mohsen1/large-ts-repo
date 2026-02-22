import { parseRunState, validateEvent, validateMetricSample } from '@domain/recovery-drill-telemetry';
import type {
  RecoveryDrillEvent,
  RecoveryDrillHealthMetric,
  RecoveryDrillMetricSample,
  RecoveryDrillTimelinePoint,
  RecoveryDrillTelemetryRunId,
  RecoverySignalSeverity,
} from '@domain/recovery-drill-telemetry';
import { RecoveryDrillEvent as TypedRecoveryDrillEvent, type RecoveryDrillRunSummary } from '@domain/recovery-drill-telemetry';

export interface ParsedEventResult {
  readonly envelopeId: string;
  readonly parsed: RecoveryDrillEvent;
}

export const parseIncomingEvent = (input: unknown): ParsedEventResult => {
  const parsed = validateEvent(input) as RecoveryDrillEvent;
  const envelopeId = `${parsed.runId}:${parsed.at}:${parsed.kind}`;
  return { envelopeId, parsed };
};

export const parseIncomingMetric = (input: unknown): RecoveryDrillMetricSample => {
  return validateMetricSample(input) as RecoveryDrillMetricSample;
};

export const scoreBySeverity = (
  severity: RecoverySignalSeverity,
  base: number,
): number => {
  const boost = severity === 'critical' ? 80 : severity === 'error' ? 40 : severity === 'degrade' ? 15 : 0;
  return Math.min(100, base + boost);
};

export const dedupeTimeline = (
  points: readonly RecoveryDrillTimelinePoint[],
): RecoveryDrillTimelinePoint[] => {
  const result: RecoveryDrillTimelinePoint[] = [];
  const latestBySource = new Map<string, number>();
  for (const point of points) {
    const key = `${point.at}:${point.source}`;
    const parsed = Date.parse(point.at);
    if (Number.isNaN(parsed)) continue;

    const existingIndex = latestBySource.get(key);
    if (existingIndex === undefined) {
      latestBySource.set(key, result.length);
      result.push(point);
    } else {
      result[existingIndex] = point;
    }
  }
  return result;
};

export const buildEnvelope = <T>(kind: string, body: T): {
  id: string;
  kind: string;
  version: string;
  body: T;
  receivedAt: string;
} => {
  const payload = JSON.stringify(body);
  return {
    id: `${kind}:${Date.now()}:${payload.length}`,
    kind,
    version: '1.0',
    body,
    receivedAt: new Date().toISOString(),
  };
};

export const normalizeRunState = parseRunState;

export function sortByReceived<T>(items: readonly T[], readAt: (item: T) => string): T[] {
  return [...items].sort((a, b) => readAt(a).localeCompare(readAt(b)));
}

export const aggregateHealth = (
  samples: readonly RecoveryDrillMetricSample[],
): RecoveryDrillHealthMetric[] => {
  const byName = new Map<string, RecoveryDrillMetricSample[]>();
  for (const sample of samples) {
    const bucket = byName.get(sample.metric.name) ?? [];
    bucket.push(sample);
    byName.set(sample.metric.name, bucket);
  }

  return [...byName.entries()].map(([name, items]) => {
    const metric = items[items.length - 1]!.metric;
    return {
      ...metric,
      name,
      baseline: metric.baseline,
      minSafe: metric.minSafe,
      maxSafe: metric.maxSafe,
      current: metric.current,
      unit: metric.unit,
    };
  });
};
