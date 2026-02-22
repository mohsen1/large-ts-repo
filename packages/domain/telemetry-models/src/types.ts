import { Brand, MaybePromise, OptionalKeys, PageResult, RecursivePath, RequiredKeys } from '@shared/core';

export type TimestampMs = Brand<number, 'TimestampMs'>;
export type TenantId = Brand<string, 'TenantId'>;
export type StreamId = Brand<string, 'StreamId'>;
export type TraceId = Brand<string, 'TraceId'>;
export type EventId = Brand<string, 'EventId'>;
export type PolicyId = Brand<string, 'PolicyId'>;
export type IncidentId = Brand<string, 'IncidentId'>;
export type RouteId = Brand<string, 'RouteId'>;

export type SignalKind = 'metric' | 'span' | 'event' | 'log';
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface TelemetryDimension {
  readonly [key: string]: string;
}

export interface TelemetrySample<TPayload = unknown> {
  readonly tenantId: TenantId;
  readonly streamId: StreamId;
  readonly signal: SignalKind;
  readonly timestamp: TimestampMs;
  readonly payload: TPayload;
  readonly tags: TelemetryDimension;
}

export interface MetricSample {
  readonly name: string;
  readonly unit: 'count' | 'seconds' | 'bytes' | 'percent';
  readonly value: number;
}

export interface SpanSample {
  readonly traceId: TraceId;
  readonly name: string;
  readonly durationMs: number;
  readonly status: 'ok' | 'error' | 'timeout';
  readonly parentSpanId?: EventId;
}

export interface LogSample {
  readonly level: 'debug' | 'info' | 'warn' | 'error';
  readonly message: string;
  readonly context: Record<string, unknown>;
}

export type AnyPayload = MetricSample | SpanSample | LogSample | Record<string, unknown>;
export type NormalizedTelemetrySample = TelemetrySample<AnyPayload>;

export interface EventWindow<TPayload = unknown> {
  readonly start: TimestampMs;
  readonly end: TimestampMs;
  readonly samples: ReadonlyArray<TPayload>;
}

export interface RollingWindow {
  readonly start: TimestampMs;
  readonly end: TimestampMs;
  readonly grainMs: number;
}

export interface PolicyCondition {
  readonly expression: string;
  readonly path: RecursivePath<NormalizedTelemetrySample>;
  readonly operator: 'eq' | 'lt' | 'lte' | 'gt' | 'gte' | 'contains';
  readonly threshold: number | string;
}

export interface PolicyRule<TPayload = unknown> {
  readonly id: PolicyId;
  readonly tenantId: TenantId;
  readonly name: string;
  readonly severity: AlertSeverity;
  readonly signal: SignalKind;
  readonly window: RollingWindow;
  readonly conditions: ReadonlyArray<PolicyCondition>;
  readonly enabled: boolean;
  readonly tags: Record<string, string>;
  readonly metadata?: TPayload;
}

export interface AlertMatch {
  readonly id: Brand<string, 'AlertMatchId'>;
  readonly ruleId: PolicyId;
  readonly policyName: string;
  readonly tenantId: TenantId;
  readonly score: number;
  readonly severity: AlertSeverity;
  readonly reason: string;
  readonly createdAt: TimestampMs;
}

export interface IncidentRecord<TPayload = unknown> {
  readonly id: IncidentId;
  readonly tenantId: TenantId;
  readonly streamId: StreamId;
  readonly matchedRule: PolicyRule<TPayload>;
  readonly events: ReadonlyArray<EventId>;
  readonly severity: AlertSeverity;
  readonly resolved: boolean;
  readonly seenAt: TimestampMs;
}

export interface RouteRule {
  readonly id: RouteId;
  readonly tenantId: TenantId;
  readonly signal: SignalKind;
  readonly include: ReadonlyArray<string>;
  readonly exclude: ReadonlyArray<string>;
  readonly target: ReadonlyArray<string>;
}

export interface RoutingContext {
  readonly tenantId: TenantId;
  readonly streamId: StreamId;
  readonly signal: SignalKind;
  readonly tags: TelemetryDimension;
}

export interface TelemetryEnvelope {
  readonly id: EventId;
  readonly sample: NormalizedTelemetrySample;
  readonly fingerprint: string;
  readonly createdAt: TimestampMs;
}

export type TelemetryEventPayload = TelemetrySample['payload'];
export type TelemetryEventPage = PageResult<NormalizedTelemetrySample>;
export type PartialSample<TPayload = unknown> = Pick<Partial<TelemetrySample<TPayload>>, RequiredKeys<TelemetrySample<TPayload>> | OptionalKeys<TelemetrySample<TPayload>>>;

export type TelemetrySignalPath = RecursivePath<NormalizedTelemetrySample>;

export interface PolicyContext {
  readonly now: TimestampMs;
  readonly sample: NormalizedTelemetrySample;
  readonly windowSamples: ReadonlyArray<NormalizedTelemetrySample>;
}

export type AsyncHandler<TInput, TOutput> = (input: TInput) => MaybePromise<TOutput>;

export interface EnvelopeBuilder {
  (tenantId: TenantId, streamId: StreamId, signal: SignalKind, payload: AnyPayload, tags?: TelemetryDimension): TelemetryEnvelope;
}

export type WindowBoundary<TWindow extends RollingWindow> = TWindow['grainMs'] extends 1_000
  ? 'second'
  : TWindow['grainMs'] extends 60_000
    ? 'minute'
    : TWindow['grainMs'] extends 3_600_000
      ? 'hour'
      : 'custom';
