import { z } from 'zod';

import type { ReadinessRunId, ReadinessSignal, ReadinessDirective, ReadinessTarget } from './types';

const eventSourceSchema = z.enum(['telemetry', 'manual-check', 'synthetic', 'adapter', 'scheduler', 'simulation']);
const eventSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
const eventActionSchema = z.enum(['created', 'updated', 'suppressed', 'resolved', 'recovered']);

const eventContextSchema = z.object({
  source: eventSourceSchema,
  severity: eventSeveritySchema,
  observedAt: z.string().datetime(),
  details: z.record(z.unknown()),
  confidence: z.number().min(0).max(1),
  actor: z.string(),
  region: z.string().optional(),
});

export const readinessEventSchema = z.object({
  eventId: z.string().min(1),
  runId: z.string().min(1),
  action: eventActionSchema,
  actionAt: z.string().datetime(),
  correlationId: z.string().min(1),
  signal: eventContextSchema,
});

export interface ReadinessEventEnvelope {
  eventId: string;
  runId: ReadinessRunId;
  action: z.infer<typeof eventActionSchema>;
  actionAt: string;
  correlationId: string;
  signal: z.infer<typeof eventContextSchema>;
}

export interface ReadinessEventBucket {
  bucketId: string;
  startedAt: string;
  windowMinutes: number;
  events: ReadinessEventEnvelope[];
  signals: ReadinessSignal[];
  directiveIds: ReadinessDirective['directiveId'][];
  targetIds: ReadinessTarget['id'][];
}

export interface ReadinessEventHealth {
  runId: ReadinessRunId;
  totalEvents: number;
  uniqueBuckets: number;
  criticalCount: number;
  suppressedCount: number;
  resolvedCount: number;
  activeTargetCount: number;
  directiveCount: number;
  signalDensity: number;
  overlapWindows: number;
}

const toReadinessSource = (source: ReadinessSignal['source']): ReadinessEventEnvelope['signal']['source'] => {
  if (source === 'manual-check') return 'manual-check';
  if (source === 'synthetic') return 'synthetic';
  return 'telemetry';
};

const toEventSignal = (envelope: ReadinessEventEnvelope): ReadinessSignal => ({
  signalId: envelope.eventId as ReadinessSignal['signalId'],
  runId: envelope.runId,
  source: envelope.signal.source === 'manual-check' ? 'manual-check' : envelope.signal.source === 'synthetic' ? 'synthetic' : 'telemetry',
  targetId: (envelope.signal.details.targetId as ReadinessSignal['targetId']) ?? ('target:unbound' as ReadinessSignal['targetId']),
  name: (envelope.signal.details.name as string) ?? 'readiness-event',
  severity: envelope.signal.severity,
  capturedAt: envelope.actionAt,
  details: envelope.signal.details,
});

const makeBucketId = (base: string, windowMinutes: number): string => `${base}|${windowMinutes}m`;

const getBucketStart = (at: string, windowMinutes: number): Date => {
  const current = new Date(at).getTime();
  const interval = windowMinutes * 60_000;
  const windowStart = Math.floor(current / interval) * interval;
  return new Date(windowStart);
};

const overlaps = (left: { start: string; end: string }, right: { start: string; end: string }): boolean => {
  const leftStart = new Date(left.start).getTime();
  const leftEnd = new Date(left.end).getTime();
  const rightStart = new Date(right.start).getTime();
  const rightEnd = new Date(right.end).getTime();
  return leftEnd >= rightStart && rightEnd >= leftStart;
};

export const parseReadinessEvent = (raw: unknown): ReadinessEventEnvelope => {
  const event = readinessEventSchema.parse(raw);
  return {
    ...event,
    runId: event.runId as ReadinessRunId,
    signal: {
      ...event.signal,
      source: event.signal.source as ReadinessEventEnvelope['signal']['source'],
    },
  };
};

export const toReadinessEvent = (signal: ReadinessSignal, action: ReadinessEventEnvelope['action'], actor = 'system'): ReadinessEventEnvelope => ({
  eventId: `${action}:${signal.signalId}`,
  runId: signal.runId,
  action,
  actionAt: new Date().toISOString(),
  correlationId: `${signal.runId}:${action}`,
  signal: {
    source: toReadinessSource(signal.source),
    severity: signal.severity,
    observedAt: signal.capturedAt,
    details: {
      ...signal.details,
      targetId: signal.targetId,
      name: signal.name,
      directiveId: signal.signalId,
    },
    confidence: 0.87,
    actor,
    region: signal.details.region as string | undefined,
  },
});

export const bucketizeEvents = (
  events: ReadonlyArray<ReadinessEventEnvelope>,
  windowMinutes = 5,
): ReadonlyArray<ReadinessEventBucket> => {
  const buckets = new Map<string, ReadinessEventBucket>();

  for (const event of events) {
    const bucketStart = getBucketStart(event.actionAt, windowMinutes);
    const bucketId = makeBucketId(bucketStart.toISOString(), windowMinutes);
    const signal = toEventSignal(event);
    const existing = buckets.get(bucketId);

    if (!existing) {
      buckets.set(bucketId, {
        bucketId,
        startedAt: bucketStart.toISOString(),
        windowMinutes,
        events: [event],
        signals: [signal],
        directiveIds: [(signal.signalId as never) as ReadinessDirective['directiveId']],
        targetIds: [signal.targetId],
      });
      continue;
    }

    existing.events.push(event);
    existing.signals.push(signal);
    if (signal.targetId && existing.targetIds.indexOf(signal.targetId) === -1) {
      existing.targetIds.push(signal.targetId);
    }
  }

  return [...buckets.values()].sort((left, right) => left.startedAt.localeCompare(right.startedAt));
};

export const buildReadinessEventHealth = (
  runId: ReadinessRunId,
  events: ReadonlyArray<ReadinessEventEnvelope>,
): ReadinessEventHealth => {
  const criticalCount = events.filter((event) => event.signal.severity === 'critical').length;
  const suppressedCount = events.filter((event) => event.action === 'suppressed').length;
  const resolvedCount = events.filter((event) => event.action === 'resolved').length;
  const buckets = bucketizeEvents(events);
  const signalDensity = buckets.length > 0 ? events.length / buckets.length : 0;

  const directiveIds = new Set(events.map((event) => event.signal.details.directiveId as string));
  const targetIds = new Set(events.map((event) => event.signal.details.targetId as string));

  const windowPairs = buckets.map((bucket) => ({ start: bucket.startedAt, end: bucket.startedAt }));
  let overlapWindows = 0;
  for (let left = 0; left < windowPairs.length; left += 1) {
    for (let right = left + 1; right < windowPairs.length; right += 1) {
      if (overlaps(windowPairs[left], windowPairs[right])) {
        overlapWindows += 1;
      }
    }
  }

  return {
    runId,
    totalEvents: events.length,
    uniqueBuckets: buckets.length,
    criticalCount,
    suppressedCount,
    resolvedCount,
    activeTargetCount: targetIds.size,
    directiveCount: directiveIds.size,
    signalDensity: Number(signalDensity.toFixed(2)),
    overlapWindows,
  };
};

export const summarizeEventBuckets = (runId: ReadinessRunId, events: ReadonlyArray<ReadinessEventEnvelope>): string => {
  const byWindow = bucketizeEvents(events);
  const signalCount = byWindow.reduce((sum, bucket) => sum + bucket.signals.length, 0);
  const hasCritical = byWindow.some((bucket) => bucket.signals.some((signal) => signal.severity === 'critical'));
  return `run=${runId} windows=${byWindow.length} signals=${signalCount} critical=${hasCritical}`;
};
