import { z } from 'zod';
import { Brand } from '@shared/core';
import type { EventRecord } from './identity.js';

export const eventPayloadSchema = z
  .object({
    version: z.literal('1.0.0'),
    eventId: z.string(),
    eventType: z.string(),
    tenant: z.string(),
    generatedAt: z.string().datetime(),
    payload: z.record(z.unknown()),
  })
  .passthrough();

export type EventPayload = z.infer<typeof eventPayloadSchema> & {
  eventType: `event.${string}`;
};

export type TypedEnvelope<TKind extends string, TPayload> = {
  kind: TKind;
  version: `v${number}`;
  timestamp: string;
  payload: TPayload;
} & {
  requestId: Brand<string, 'RequestId'>;
};

export const assertEnvelope = <T>(value: unknown): EventPayload => {
  const parsed = eventPayloadSchema.parse(value);
  return parsed as EventPayload;
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const asEventEnvelope = <TKind extends string, TData>(value: {
  kind: TKind;
  payload: TData;
}): TypedEnvelope<TKind, TData> => ({
  kind: value.kind,
  version: 'v1',
  timestamp: new Date().toISOString(),
  payload: value.payload,
  requestId: `req:${value.kind}` as Brand<string, 'RequestId'>,
});

export const normalizeEvent = <T extends EventRecord>(event: T): EventRecord => ({
  ...event,
  occurredAt: event.occurredAt,
  metadata: {
    ...event.metadata,
    normalizedAt: new Date().toISOString(),
  },
});

export const isEventRecord = (value: unknown): value is EventRecord => {
  return (
    isRecord(value) &&
    typeof (value as EventRecord).scope === 'string' &&
    typeof (value as EventRecord).scopeId === 'string' &&
    typeof (value as EventRecord).kind === 'string' &&
    typeof (value as EventRecord).occurredAt === 'string' &&
    isRecord((value as EventRecord).metadata)
  );
};

export const mapEventPayloads = <T>(
  events: EventPayload[],
  mapper: (record: EventPayload, index: number) => T,
): T[] => {
  return events.map((item, index) => mapper(item, index));
};
