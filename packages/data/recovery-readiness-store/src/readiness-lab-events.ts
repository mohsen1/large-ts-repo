import type { NoInfer } from '@shared/type-level';
import type { ReadinessLabRunId, ReadinessLabSignalEnvelope } from '@domain/recovery-readiness/readiness-lab-core';

export type LabEventSequence<TPayload extends Readonly<Record<string, unknown>> = Record<string, unknown>> = ReadonlyArray<
  ReadinessLabSignalEnvelope<TPayload>
>;

export type EventCursor = BrandEventCursor<number>;
type BrandEventCursor<T extends number> = T & { readonly __brand: 'LabEventCursor' };

export interface ReadinessLabEventLogSnapshot<TPayload extends Readonly<Record<string, unknown>>> {
  readonly runId: ReadinessLabRunId;
  readonly total: number;
  readonly firstCursor: EventCursor | undefined;
  readonly lastCursor: EventCursor | undefined;
  readonly events: LabEventSequence<TPayload>;
}

const brandCursor = (value: number): EventCursor => value as EventCursor;

const toEventMap = <T extends Readonly<Record<string, unknown>>>(events: LabEventSequence<T>): ReadonlyMap<string, T> => {
  return new Map(events.map((entry) => [entry.envelopeId as string, entry.payload]));
}

function* mapIterator<T, U>(input: Iterable<T>, map: (value: T) => U): IterableIterator<U> {
  for (const value of input) {
    yield map(value);
  }
}

function* filterIterator<T>(input: Iterable<T>, shouldKeep: (value: T) => boolean): IterableIterator<T> {
  for (const value of input) {
    if (shouldKeep(value)) {
      yield value;
    }
  }
}

function* takeIterator<T>(input: Iterable<T>, limit: number): IterableIterator<T> {
  let count = 0;
  for (const value of input) {
    if (count >= limit) {
      break;
    }
    count += 1;
    yield value;
  }
}

export interface ReadinessLabEventWriter<TPayload extends Readonly<Record<string, unknown>> = Record<string, unknown>> {
  write(runId: NoInfer<ReadinessLabRunId>, envelope: ReadinessLabSignalEnvelope<TPayload>): void;
  close(): void;
}

export interface ReadinessLabEventLog<TPayload extends Readonly<Record<string, unknown>> = Record<string, unknown>> {
  append(event: ReadinessLabSignalEnvelope<TPayload>): EventCursor;
  stream(runId: NoInfer<ReadinessLabRunId>): ReadonlyArray<ReadinessLabSignalEnvelope<TPayload>>;
  streamLatest(runId: NoInfer<ReadinessLabRunId>, limit: number): ReadonlyArray<ReadinessLabSignalEnvelope<TPayload>>;
  snapshot(runId: NoInfer<ReadinessLabRunId>): ReadinessLabEventLogSnapshot<TPayload>;
}

export class InMemoryLabEventLog<TPayload extends Readonly<Record<string, unknown>> = Record<string, unknown>>
  implements ReadinessLabEventLog<TPayload>, ReadinessLabEventWriter<TPayload>
{
  readonly #events = new Map<ReadinessLabRunId, ReadinessLabSignalEnvelope<TPayload>[]>();
  readonly #counters = new Map<ReadinessLabRunId, number>();
  #closed = false;

  append(event: ReadinessLabSignalEnvelope<TPayload>): EventCursor {
    if (this.#closed) {
      throw new Error('lab-event-log-closed');
    }

    const current = (this.#counters.get(event.runId) ?? 0) + 1;
    this.#counters.set(event.runId, current);
    const list = this.#events.get(event.runId) ?? [];
    list.push(event);
    this.#events.set(event.runId, list);
    return brandCursor(current);
  }

  stream(runId: NoInfer<ReadinessLabRunId>): ReadonlyArray<ReadinessLabSignalEnvelope<TPayload>> {
    return [...(this.#events.get(runId as ReadinessLabRunId) ?? [])];
  }

  streamLatest(runId: NoInfer<ReadinessLabRunId>, limit: number): ReadonlyArray<ReadinessLabSignalEnvelope<TPayload>> {
    const all = this.#events.get(runId as ReadinessLabRunId) ?? [];
    const take = [...takeIterator(all, Math.max(0, limit))];
    return take;
  }

  snapshot(runId: NoInfer<ReadinessLabRunId>): ReadinessLabEventLogSnapshot<TPayload> {
    const all = [...this.stream(runId as ReadinessLabRunId)];
    return {
      runId: runId as ReadinessLabRunId,
      total: all.length,
      firstCursor: this.#events.has(runId as ReadinessLabRunId) ? brandCursor(1) : undefined,
      lastCursor: this.#events.has(runId as ReadinessLabRunId) ? brandCursor(all.length) : undefined,
      events: all,
    };
  }

  write(runId: ReadinessLabRunId, envelope: ReadinessLabSignalEnvelope<TPayload>): void {
    this.append({ ...envelope, runId });
  }

  close(): void {
    this.#closed = true;
  }

  snapshotPayloadMap(runId: ReadinessLabRunId): ReadonlyMap<string, TPayload> {
    return toEventMap(this.stream(runId));
  }

  search(runId: NoInfer<ReadinessLabRunId>, predicate: (entry: ReadinessLabSignalEnvelope<TPayload>) => boolean): TPayload[] {
    return [...mapIterator(filterIterator(this.stream(runId), predicate), (entry) => entry.payload)];
  }
}
