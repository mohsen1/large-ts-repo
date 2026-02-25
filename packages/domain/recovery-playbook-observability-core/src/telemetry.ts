import type { NoInfer } from '@shared/type-level';
import { withBrand } from '@shared/core';
import type { Brand } from '@shared/core';
import type {
  ObservabilityScope,
  ObservabilityRunId,
  ObservabilitySignalId,
  ObservabilityMetricId,
  ObservabilityMetricRecord,
  ObservabilityPlaybookId,
  PlaybookRuntimeMetrics,
} from './identity';

export const telemetryChannels = ['raw', 'structured', 'aggregated', 'anomaly', 'forecast', 'annotation'] as const;
export type TelemetryChannel = (typeof telemetryChannels)[number];

export type TelemetryEventType = 'signal' | 'metric' | 'annotation' | 'phase' | 'anomaly';
export type TelemetryEventId = Brand<string, 'TelemetryEventId'>;
export type TelemetryEventMap = Readonly<Record<TelemetryChannel, readonly TelemetryEnvelope<TelemetryEventType, unknown>[]>>;

export interface TelemetryEnvelope<
  TType extends TelemetryEventType = TelemetryEventType,
  TPayload = unknown,
> {
  readonly id: TelemetryEventId;
  readonly runId: ObservabilityRunId;
  readonly channel: TelemetryChannel;
  readonly type: TType;
  readonly scope: ObservabilityScope;
  readonly payload: TPayload;
  readonly createdAt: string;
}

export interface TelemetryCursor {
  readonly next: number;
  readonly correlation: string;
}

export type EventTuple<TType extends TelemetryEventType, TPayload = unknown> = readonly [
  TType,
  TelemetryEnvelope<TType, TPayload>,
];

export type TupleWindow<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Rest]
  ? readonly [Head, ...TupleWindow<Rest>]
  : readonly [];

export interface TelemetryBucket<TPayload = unknown> {
  readonly channel: TelemetryChannel;
  readonly scope: ObservabilityScope;
  readonly samples: readonly TelemetryEnvelope<TelemetryEventType, TPayload>[];
}

export interface TelemetryObservation<TScope extends ObservabilityScope = ObservabilityScope> {
  readonly scope: TScope;
  readonly signalId: ObservabilitySignalId;
  readonly metricId: ObservabilityMetricId;
  readonly metric: PlaybookRuntimeMetrics;
  readonly events: readonly TelemetryEventType[];
  readonly sampleCount: number;
}

export interface TelemetryManifest {
  readonly runId: ObservabilityRunId;
  readonly bucketCount: number;
  readonly timeline: readonly string[];
  readonly channels: readonly TelemetryChannel[];
  readonly generatedAt: string;
}

const defaultFallbackRunId = 'run-default' as ObservabilityRunId;

const emitEvent = <TType extends TelemetryEventType, TPayload>(
  runId: ObservabilityRunId,
  channel: TelemetryChannel,
  type: TType,
  scope: ObservabilityScope,
  payload: TPayload,
): TelemetryEnvelope<TType, TPayload> => ({
  id: withBrand(`event:${runId}:${scope}:${channel}:${Date.now()}`, 'TelemetryEventId'),
  runId,
  channel,
  type,
  scope,
  payload,
  createdAt: new Date().toISOString(),
});

export const createSignalTelemetry = (
  runId: ObservabilityRunId,
  scope: ObservabilityScope,
): TelemetryEnvelope<'signal', { readonly signal: ObservabilitySignalId }> =>
  emitEvent(runId, 'raw', 'signal', scope, {
    signal: withBrand(`signal:${runId}:${scope}`, 'ObservabilitySignalId'),
  });

export const createMetricTelemetry = (
  runId: ObservabilityRunId,
  scope: ObservabilityScope,
  metric: ObservabilityMetricRecord,
): TelemetryEnvelope<'metric', ObservabilityMetricRecord> =>
  emitEvent(runId, 'aggregated', 'metric', scope, metric);

export const createAnnotationTelemetry = (
  runId: ObservabilityRunId,
  scope: ObservabilityScope,
  annotation: string,
): TelemetryEnvelope<'annotation', { readonly annotation: string; readonly tags: readonly string[] }> =>
  emitEvent(runId, 'annotation', 'annotation', scope, {
    annotation,
    tags: ['operator', scope, annotation],
  });

export const createPhaseTelemetry = (
  runId: ObservabilityRunId,
  scope: ObservabilityScope,
  phase: string,
): TelemetryEnvelope<'phase', { readonly phase: string }> =>
  emitEvent(runId, 'structured', 'phase', scope, {
    phase,
  });

export const createAnomalyTelemetry = (
  runId: ObservabilityRunId,
  scope: ObservabilityScope,
  anomaly: { readonly severity: number; readonly signal: ObservabilitySignalId },
): TelemetryEnvelope<'anomaly', { readonly severity: number; readonly signal: ObservabilitySignalId }> =>
  emitEvent(runId, 'anomaly', 'anomaly', scope, {
    severity: anomaly.severity,
    signal: anomaly.signal,
  });

const mapIterator = <TInput, TOutput>(
  input: Iterable<TInput>,
  mapper: (value: TInput, index: number) => TOutput,
): TOutput[] => {
  const out: TOutput[] = [];
  let index = 0;
  for (const value of input) {
    out.push(mapper(value, index++));
  }
  return out;
};

const filterIterator = <T>(
  input: Iterable<T>,
  shouldKeep: (value: T, index: number) => boolean,
): T[] => {
  const out: T[] = [];
  let index = 0;
  for (const value of input) {
    if (shouldKeep(value, index++)) {
      out.push(value);
    }
  }
  return out;
};

const chunkIterator = <T>(input: Iterable<T>, size: number): Array<readonly T[]> => {
  const normalized = Math.max(1, size);
  const chunks: T[][] = [];
  let current: T[] = [];
  for (const value of input) {
    current.push(value);
    if (current.length === normalized) {
      chunks.push(current);
      current = [];
    }
  }
  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
};

export const packObservationBuckets = (
  channels: Readonly<TelemetryEventMap>,
): ReadonlyArray<readonly TelemetryEnvelope<TelemetryEventType, unknown>[]> => {
  const grouped = Object.entries(channels) as Array<[
    TelemetryChannel,
    readonly TelemetryEnvelope<TelemetryEventType, unknown>[]
  ]>;

  const entries = grouped.map((entry) => entry[1]);
  return chunkIterator(entries.flatMap((events) => events), 3);
};

export const telemetryTimelineFromEvents = (
  events: readonly TelemetryEnvelope[],
): readonly string[] => {
  const mapped = mapIterator(events, (event) => `${event.channel}:${event.scope}:${event.type}:${event.id}`);
  return mapped;
};

export const extractTelemetryByChannel = <T extends readonly TelemetryEnvelope[]>(
  events: NoInfer<T>,
  channel: TelemetryChannel,
): readonly Extract<T[number], { readonly channel: typeof channel }>[] => {
  const matching: Array<Extract<T[number], { readonly channel: typeof channel }>> = [];
  for (const event of events) {
    if (event.channel === channel) {
      matching.push(event as Extract<T[number], { readonly channel: typeof channel }>);
    }
  }

  return matching;
};

const eventTypeBuckets = <TEvents extends readonly TelemetryEnvelope[]>(
  events: TEvents,
): Record<TelemetryChannel, readonly TEvents[number][]> => {
  const empty = telemetryChannels.reduce((acc, channel) => {
    acc[channel] = [];
    return acc;
  }, {} as Record<TelemetryChannel, readonly TEvents[number][]>);

  const current = { ...empty } as Record<TelemetryChannel, TEvents[number][]>;

  for (const event of events) {
    const bucket = current[event.channel] as TEvents[number][];
    bucket.push(event);
  }

  return current;
};

export const summarizeTelemetry = (
  events: readonly TelemetryEnvelope[],
): TelemetryManifest => {
  const channels = [...new Set(events.map((event) => event.channel))] as TelemetryChannel[];
  const timeline = telemetryTimelineFromEvents(events);
  const bucketCount = eventTypeBuckets(events).raw.length + telemetryTimelineFromEvents(events).length;
  return {
    runId: events[0]?.runId ?? defaultFallbackRunId,
    bucketCount,
    timeline,
    channels,
    generatedAt: new Date().toISOString(),
  };
};
