import { z } from 'zod';
import type { NamespaceTag, RunId, TenantId, StageId } from '@domain/recovery-ecosystem-core';
import type { JsonValue, JsonObject } from '@shared/type-level';
import type { EcosystemAuditEvent, StoreEnvelope } from './store-contract';

const EventKind = z.string().startsWith('event:').brand<'EventKind'>();

const EnvelopeSchema = z.object({
  version: z.string().trim().startsWith('v'),
  payload: z.unknown(),
  checksum: z.string().trim().min(1),
});

const NamespaceSchema = z.union([z.string().trim().startsWith('ns:'), z.string().trim().startsWith('namespace:')]);

const EventSchema = z.object({
  namespace: NamespaceSchema,
  runId: z.string().trim().startsWith('run:'),
  tenant: z.string().trim().startsWith('tenant:'),
  event: EventKind,
  at: z.string().datetime(),
  stageId: z.string().trim().startsWith('stage:').optional(),
  payload: z.unknown(),
});

export const parseEvent = (value: unknown): EcosystemAuditEvent => {
  const parsed = EventSchema.parse(value) as {
    readonly namespace: string;
    readonly runId: string;
    readonly tenant: string;
    readonly stageId?: string;
    readonly event: `event:${string}`;
    readonly at: string;
    readonly payload: JsonValue;
  };
  return {
    ...parsed,
    namespace: `namespace:${parsed.namespace.split(':').slice(1).join(':')}` as NamespaceTag,
    runId: parsed.runId as unknown as RunId,
    tenant: parsed.tenant as unknown as TenantId,
    stageId: parsed.stageId ? (parsed.stageId as unknown as StageId) : undefined,
    payload: parsed.payload,
  };
};

export const parseEnvelope = <TValue extends JsonValue>(raw: unknown): StoreEnvelope<TValue> => {
  const parsed = EnvelopeSchema.parse(raw);
  return {
    version: parsed.version as `v${number}`,
    payload: parsed.payload as TValue,
    checksum: parsed.checksum,
  };
};

export const parseEventPayload = (value: unknown): JsonObject => {
  const parsed = z.record(z.string(), z.unknown()).parse(value);
  return parsed as JsonObject;
};

export const buildEventEnvelope = <TValue extends JsonValue>(value: ValueEnvelope<TValue>): StoreEnvelope<ValueEnvelope<TValue>> => ({
  version: 'v1',
  payload: value,
  checksum: `sum:${value.event}:${value.at.length}`,
});

export const eventStreamToArray = async <TPayload extends JsonValue>(
  source: AsyncIterable<EcosystemAuditEvent<TPayload>>,
): Promise<readonly EcosystemAuditEvent<TPayload>[]> => {
  const output: EcosystemAuditEvent<TPayload>[] = [];
  for await (const event of source) {
    output.push(event);
  }
  return output;
};

export const splitEventKey = (value: string): {
  namespace: string;
  runId: string;
  stageId?: string;
} => {
  const [namespace, runId, stageId] = value.split('::');
  return { namespace, runId, stageId };
};

type ValueEnvelope<TValue extends JsonValue> = {
  readonly event: string;
  readonly at: string;
  readonly payload: TValue;
};
