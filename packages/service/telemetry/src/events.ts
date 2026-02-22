import { TelemetryEnvelope } from '@domain/telemetry-models';
import { Metric } from './telemetry';

export interface EventBus {
  publish(event: Metric): void;
  publishEnvelope(envelope: TelemetryEnvelope): Promise<void>;
  on(event: string, handler: (payload: TelemetryEnvelope) => void): void;
}

export interface EventSummary {
  name: string;
  count: number;
  latest: number;
}

export interface MemoryEventBusOptions {
  limit?: number;
  dedupeByFingerprint?: boolean;
}

export class MemoryEventBus implements EventBus {
  private readonly events: Metric[] = [];
  private readonly envelopes: TelemetryEnvelope[] = [];
  private readonly dedupe = new Set<string>();
  private readonly handlers = new Map<string, Array<(payload: TelemetryEnvelope) => void>>();
  private readonly options: MemoryEventBusOptions;

  constructor(options: MemoryEventBusOptions = {}) {
    this.options = options;
  }

  publish(event: Metric): void {
    this.events.push(event);
    if (this.events.length > (this.options.limit ?? 4000)) {
      this.events.shift();
    }
  }

  async publishEnvelope(envelope: TelemetryEnvelope): Promise<void> {
    if (this.options.dedupeByFingerprint && this.dedupe.has(envelope.fingerprint)) {
      return;
    }
    this.dedupe.add(envelope.fingerprint);
    this.envelopes.push(envelope);
    const subscribers = this.handlers.get(envelope.sample.signal) ?? [];
    for (const handler of subscribers) {
      handler(envelope);
    }
  }

  on(event: string, handler: (payload: TelemetryEnvelope) => void): void {
    const next = this.handlers.get(event) ?? [];
    next.push(handler);
    this.handlers.set(event, next);
  }

  drain(): Metric[] {
    const next = [...this.events];
    this.events.length = 0;
    return next;
  }

  drainEnvelopes(): TelemetryEnvelope[] {
    const next = [...this.envelopes];
    this.envelopes.length = 0;
    return next;
  }
}

export function summarize(events: readonly Metric[]): EventSummary[] {
  const map = new Map<string, EventSummary>();
  for (const event of events) {
    const next = map.get(event.name);
    if (!next) {
      map.set(event.name, { name: event.name, count: 1, latest: event.value });
    } else {
      next.count += 1;
      next.latest = event.value;
    }
  }
  return [...map.values()];
}

export function summarizeBySignal(events: readonly TelemetryEnvelope[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const envelope of events) {
    out[envelope.sample.signal] = (out[envelope.sample.signal] ?? 0) + 1;
  }
  return out;
}

export const toEnvelopeFromMetric = (metric: Metric): TelemetryEnvelope => ({
  id: `${metric.name}-${metric.at}` as TelemetryEnvelope['id'],
  sample: {
    tenantId: '' as TelemetryEnvelope['sample']['tenantId'],
    streamId: '' as TelemetryEnvelope['sample']['streamId'],
    signal: 'metric',
    timestamp: metric.at,
    payload: metric,
    tags: metric.tags,
  } as TelemetryEnvelope['sample'],
  fingerprint: `${metric.name}:${metric.value}:${metric.at}`,
  createdAt: metric.at,
});

export const filterBySignal = (events: readonly TelemetryEnvelope[], signal: string): TelemetryEnvelope[] =>
  events.filter((event) => event.sample.signal === signal);
