import { createHash } from 'node:crypto';
import type { JsonValue } from '@shared/type-level';
import { fail, ok, type Result } from '@shared/result';
import type { EcosystemAuditEvent, EcosystemStorePort, StoreStats } from '@data/recovery-ecosystem-store';
import type { NamespaceTag, RunId } from '@domain/recovery-ecosystem-core';

export interface TraceEnvelope<TPayload extends JsonValue = JsonValue> {
  readonly event: `event:${string}`;
  readonly namespace: NamespaceTag;
  readonly at: string;
  readonly payload: TPayload;
  readonly signature: string;
}

export interface ObserveFrame<TPayload extends JsonValue = JsonValue> {
  readonly runId: RunId;
  readonly event: EcosystemAuditEvent<TPayload>;
  readonly fingerprint: string;
  readonly namespace: NamespaceTag;
}

export type WindowBucket<TValue extends JsonValue> = {
  readonly start: string;
  readonly end: string;
  readonly values: readonly EcosystemAuditEvent<TValue>[];
};

type AsyncIterableFrame<TPayload extends JsonValue> = AsyncIterable<ObserveFrame<TPayload>>;

const fingerprint = (value: JsonValue): string => {
  const digest = createHash('sha1');
  digest.update(JSON.stringify(value));
  return digest.digest('hex').slice(0, 12);
};

const normalizeFrames = (values: Iterable<unknown>): Array<unknown> => {
  const output = [];
  for (const value of values) {
    output.push(value);
  }
  return output;
};

class ObservabilityScope {
  readonly startedAt = new Date().toISOString();

  public async [Symbol.asyncDispose](): Promise<void> {
    void this.startedAt;
    return Promise.resolve();
  }
}

class TraceSeries {
  readonly #events: ObserveFrame[] = [];

  public add(frame: ObserveFrame): void {
    this.#events.push(frame);
  }

  public rows(limit: number): readonly ObserveFrame[] {
    return [...this.#events].sort((left, right) => left.event.at.localeCompare(right.event.at)).slice(0, limit);
  }

  public clear(): void {
    this.#events.length = 0;
  }
}

export class EcosystemObservabilityService {
  readonly #series = new TraceSeries();

  public async collect<TPayload extends JsonValue>(
    store: EcosystemStorePort,
    namespace: NamespaceTag,
    limit = 100,
  ): Promise<AsyncIterableFrame<TPayload>> {
    const snapshots = await store.query(namespace);
    const frames: ObserveFrame<TPayload>[] = snapshots.flatMap((snapshot) => {
      const payload = snapshot.payload as TPayload;
      const frame: ObserveFrame<TPayload> = {
        runId: snapshot.runId,
        event: {
          namespace,
          runId: snapshot.runId,
          tenant: snapshot.tenant,
          event: `event:snapshot-read`,
          at: snapshot.generatedAt,
          payload,
        } as EcosystemAuditEvent<TPayload>,
        fingerprint: fingerprint(snapshot.payload),
        namespace,
      };
      return [frame];
    });

    const sorted = frames.toSorted((left, right) => right.event.at.localeCompare(left.event.at));
    for (const frame of sorted.slice(0, limit)) {
      this.#series.add(frame);
    }

    return {
      async *[Symbol.asyncIterator]() {
        for (const frame of sorted.slice(0, limit)) {
          yield frame;
        }
      },
    };
  }

  public async inspect<TPayload extends JsonValue>(
    store: EcosystemStorePort,
    namespace: NamespaceTag,
    runId: RunId,
  ): Promise<Result<WindowBucket<TPayload>>> {
    await using _scope = new ObservabilityScope();
    const readStream = await store.read(runId);
    const events = [];
    for await (const event of readStream) {
      events.push(event);
    }

    const withNamespace = events.filter((entry) => entry.namespace === namespace) as EcosystemAuditEvent<TPayload>[];
    const byRun = withNamespace.toSorted((left, right) => left.at.localeCompare(right.at));

    if (byRun.length === 0) {
      return fail(new Error('run-events-empty'), 'inspect');
    }

    const first = byRun.at(0);
    const last = byRun.at(-1);
    if (!first) {
      return fail(new Error('run-events-empty'), 'inspect');
    }

    return ok({
      start: first.at,
      end: last?.at ?? first.at,
      values: byRun,
    });
  }

  public digest(namespace: NamespaceTag, events: readonly ObserveFrame[]): string {
    return events
      .filter((event) => event.namespace === namespace)
      .map((event) => event.fingerprint)
      .toSorted()
      .join('|');
  }

  public stats(store: EcosystemStorePort): Promise<StoreStats> {
    return Promise.resolve(store.stats());
  }

  public recent(limit = 25): readonly ObserveFrame[] {
    return this.#series.rows(limit);
  }
}

export const createObservabilityService = (): EcosystemObservabilityService => new EcosystemObservabilityService();

export const traceEnvelope = <TPayload extends JsonValue>(value: ObserveFrame<TPayload>): TraceEnvelope<TPayload> => ({
  event: value.event.event,
  namespace: value.namespace,
  at: value.event.at,
  payload: value.event.payload,
  signature: value.fingerprint,
});

export const normalizeObservabilityPayload = (payload: JsonValue): readonly string[] =>
  normalizeFrames(Object.values(payload as object)).map((entry) => String(entry));
