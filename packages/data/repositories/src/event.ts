import { Result, fail, ok } from '@shared/result';
import { listByCursor, CursorWindow } from './query';

export interface EventEnvelope<TPayload = unknown> {
  readonly id: string;
  readonly tenantId: string;
  readonly kind: string;
  readonly payload: TPayload;
  readonly at: string;
}

export interface EventEnvelopeInput<TPayload = unknown> {
  readonly tenantId: string;
  readonly kind: string;
  readonly payload: TPayload;
}

interface Snapshot<TPayload> {
  readonly items: readonly EventEnvelope<TPayload>[];
  readonly cursor?: string;
}

export interface EventStore<TPayload = unknown> {
  append(record: EventEnvelopeInput<TPayload>): Promise<Result<EventEnvelope<TPayload>>>;
  findByTenant(tenantId: string, options?: { limit?: number; cursor?: string }): Promise<Result<Snapshot<TPayload>>>;
  findByKind(kind: string): Promise<Result<EventEnvelope<TPayload>[]>>;
  last(tenantId: string): Promise<Result<EventEnvelope<TPayload> | undefined>>;
}

export class InMemoryEventStore<TPayload = unknown> implements EventStore<TPayload> {
  private readonly records = new Map<string, EventEnvelope<TPayload>[]>();

  async append(record: EventEnvelopeInput<TPayload>): Promise<Result<EventEnvelope<TPayload>>> {
    try {
      const at = new Date().toISOString();
      const envelope: EventEnvelope<TPayload> = {
        id: `${record.tenantId}:${record.kind}:${at}`,
        tenantId: record.tenantId,
        kind: record.kind,
        payload: record.payload,
        at,
      };
      const bucket = this.records.get(record.tenantId) ?? [];
      bucket.push(envelope);
      this.records.set(record.tenantId, bucket);
      return ok(envelope);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('append failure'));
    }
  }

  async findByTenant(
    tenantId: string,
    options?: {
      limit?: number;
      cursor?: string;
    },
  ): Promise<Result<Snapshot<TPayload>>> {
    const bucket = this.records.get(tenantId) ?? [];
    const window: CursorWindow<EventEnvelope<TPayload>> = listByCursor(bucket, {
      limit: options?.limit,
      cursor: options?.cursor,
      sortBy: (left, right) => Date.parse(left.at) - Date.parse(right.at),
    });
    return ok({
      items: window.items,
      cursor: window.nextCursor,
    });
  }

  async findByKind(kind: string): Promise<Result<EventEnvelope<TPayload>[]>> {
    const all = Array.from(this.records.values()).flat();
    return ok(all.filter((event) => event.kind === kind));
  }

  async last(tenantId: string): Promise<Result<EventEnvelope<TPayload> | undefined>> {
    const events = await this.findByTenant(tenantId);
    if (!events.ok) return events as Result<undefined>;
    const last = events.value.items.at(-1);
    return ok(last);
  }
}
