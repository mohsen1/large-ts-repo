import { Brand } from '@shared/core';
import { ok, err, Result } from '@shared/result';
import { z } from 'zod';

export type TenantId = Brand<string, 'TenantId'>;
export type Region = Brand<string, 'Region'>;
export type ServiceId = Brand<string, 'ServiceId'>;
export type EventId = Brand<string, 'EventId'>;
export type TraceId = Brand<string, 'TraceId'>;

export type JsonPrimitive = string | number | boolean | null;
export type JsonArray = readonly JsonValue[];
export type JsonObject = { readonly [key: string]: JsonValue };
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

export interface EnvelopeContext {
  tenantId: TenantId;
  serviceId: ServiceId;
  region: Region;
  correlationId?: TraceId;
  revision: number;
}

export interface TimedEnvelope<TPayload extends JsonObject = JsonObject> {
  eventId: EventId;
  kind: string;
  payload: TPayload;
  context: EnvelopeContext;
  createdAt: string;
}

export interface Versioned<T> {
  schemaVersion: number;
  payload: T;
}

export type NonEmptyArray<T> = readonly [T, ...T[]];

export type Mergeable<TLeft, TRight> = Omit<TLeft, keyof TRight> & TRight;

export type Mutable<T> = { -readonly [P in keyof T]: T[P] };

export type Optionalize<T, K extends keyof T> = Omit<T, K> & { [P in K]?: T[P] };

export interface TraceMeta {
  operation: string;
  actor?: string;
  confidence?: number;
}

export interface TraceEnvelope<TPayload extends JsonObject = JsonObject, TMeta extends TraceMeta = TraceMeta> {
  tenantId: TenantId;
  serviceId: ServiceId;
  eventId: EventId;
  traceId: TraceId;
  kind: string;
  payload: TPayload;
  meta: TMeta;
  createdAt: string;
}

export const TraceEnvelopeSchema = z.object({
  tenantId: z.string().min(1),
  serviceId: z.string().min(1),
  eventId: z.string().uuid().or(z.string().min(5)),
  traceId: z.string().min(1),
  kind: z.string().min(1),
  payload: z.record(z.unknown()),
  meta: z.object({
    operation: z.string().min(1),
    actor: z.string().optional(),
    confidence: z.number().min(0).max(1).optional(),
  }),
  createdAt: z.string().datetime(),
});

export const createEnvelope = <TPayload extends JsonObject, TMeta extends TraceMeta>(
  tenantId: string,
  serviceId: string,
  kind: string,
  payload: TPayload,
  meta: TMeta,
): TimedEnvelope<TPayload> => {
  return {
    eventId: crypto.randomUUID() as EventId,
    kind,
    payload,
    context: {
      tenantId: tenantId as TenantId,
      serviceId: serviceId as ServiceId,
      region: 'us-east-1' as Region,
      correlationId: crypto.randomUUID() as TraceId,
      revision: 1,
    },
    createdAt: new Date().toISOString(),
  };
};

export const decodeEnvelope = <T>(value: unknown): Result<TimedEnvelope & { payload: T }, string> => {
  const parsed = TraceEnvelopeSchema.safeParse(value);
  if (!parsed.success) {
    return err(parsed.error.issues.map((issue) => issue.message).join(', '));
  }

  return ok(parsed.data as TimedEnvelope & { payload: T });
};

export const toEnvelope = <TPayload extends JsonObject>(input: TimedEnvelope<TPayload>): TraceEnvelope<TPayload, TraceMeta> => ({
  tenantId: input.context.tenantId,
  serviceId: input.context.serviceId,
  eventId: input.eventId,
  traceId: input.context.correlationId ?? input.eventId,
  kind: input.kind,
  payload: input.payload,
  meta: {
    operation: input.kind,
    actor: 'orchestrator',
    confidence: 1,
  },
  createdAt: input.createdAt,
});
