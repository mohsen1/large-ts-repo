import { AlertSeverity, AlertMatch, MetricSample, NormalizedTelemetrySample, SignalKind, TelemetryDimension, TimestampMs } from '@domain/telemetry-models';
import { Brand, Merge } from '@shared/core';

export type MetricName = Brand<string, 'MetricName'>;

export interface MetricValue {
  readonly name: MetricName;
  readonly value: number;
  readonly tags: TelemetryDimension;
  readonly at: TimestampMs;
}

export interface Counter {
  name: string;
  increment(labels?: TelemetryDimension, value?: number): void;
  get(): number;
}

export interface Timer {
  readonly id: Brand<string, 'TimerId'>;
  readonly operation: string;
  readonly startedAt: TimestampMs;
  readonly tags: TelemetryDimension;
  stop(): MetricValue;
}

export interface TelemetryCounterDelta {
  readonly previous: number;
  readonly next: number;
  readonly delta: number;
}

export interface MetricSnapshot {
  readonly metrics: ReadonlyArray<MetricValue>;
  readonly matches: ReadonlyArray<AlertMatch>;
  readonly summary: Readonly<Record<SignalKind, number>>;
}

export class InMemoryCounter implements Counter {
  private value = 0;
  constructor(public readonly name: string, private readonly labels: TelemetryDimension = {}) {}

  increment(labels: TelemetryDimension = {}, value = 1): void {
    if (Object.keys(labels).length > 0 && JSON.stringify(labels) !== JSON.stringify(this.labels)) {
      return;
    }
    this.value += value;
  }

  get(): number {
    return this.value;
  }
}

export class Gauge {
  private value = 0;
  constructor(public readonly name: string) {}
  set(value: number): void { this.value = value; }
  add(delta: number): void { this.value += delta; }
  get(): number { return this.value; }
  reset(): void { this.value = 0; }
}

export class Span implements Timer {
  readonly id = `${Date.now()}` as Brand<string, 'TimerId'>;
  readonly startedAt = Date.now() as TimestampMs;
  constructor(
    public readonly operation: string,
    public readonly tags: TelemetryDimension = {},
  ) {}

  stop(): MetricValue {
    const duration = Date.now() - this.startedAt;
    return { name: 'span_ms' as MetricName, value: duration, tags: this.tags, at: Date.now() as TimestampMs };
  }
}

export class MetricBuffer {
  private readonly rows: MetricSample[] = [];
  add(sample: MetricSample): void {
    this.rows.push(sample);
  }
  flush(): MetricSample[] {
    const next = [...this.rows];
    this.rows.length = 0;
    return next;
  }
  length(): number {
    return this.rows.length;
  }
}

export const counter = (name: string): Counter => {
  return new InMemoryCounter(name);
};

export const buildAlertDelta = (left: AlertMatch, right: AlertMatch): TelemetryCounterDelta => {
  return {
    previous: left.score,
    next: right.score,
    delta: right.score - left.score,
  };
};

export const toMetric = (name: string, value: number, tags: TelemetryDimension = {}): NormalizedTelemetrySample['sample'] => ({
  tenantId: '' as NormalizedTelemetrySample['sample']['tenantId'],
  streamId: '' as NormalizedTelemetrySample['sample']['streamId'],
  signal: 'metric',
  timestamp: Date.now() as TimestampMs,
  payload: { name, value, unit: 'count' },
  tags,
});

export const snapshotFrom = (samples: ReadonlyArray<MetricSample>): MetricSnapshot => {
  const metrics = samples.map((sample) => ({ ...sample, at: Date.now() as TimestampMs, name: sample.name as MetricName }));
  const summary: Record<SignalKind, number> = {
    metric: metrics.length,
    span: 0,
    event: 0,
    log: 0,
  };
  return { metrics, matches: [], summary };
};

export const mergeDimensions = (left: TelemetryDimension, right: TelemetryDimension): TelemetryDimension => ({
  ...left,
  ...right,
});

export const mergeSamples = <T extends NormalizedTelemetrySample>(left: T, right: T): Merge<T, T> => ({
  ...left,
  ...right,
}) as Merge<T, T>;

export const brandValue = <T>(value: T): Brand<T, 'Brand'> => value as Brand<T, 'Brand'>;
