import type { LabRuntimeEvent } from './types.js';

type IteratorChain<T> = IterableIterator<T> & {
  map<U>(mapper: (value: T) => U): IteratorChain<U>;
  filter(condition: (value: T) => boolean): IteratorChain<T>;
  toArray(): T[];
};

export interface StreamSnapshot<T> {
  readonly size: number;
  readonly first: T | null;
  readonly last: T | null;
}

export interface EventIteratorSource<T> extends AsyncIterable<T>, AsyncDisposable {
  emit(value: T): void;
  readonly count: number;
  readonly snapshot: StreamSnapshot<T>;
}

export class LabEventBuffer<T> implements EventIteratorSource<T>, AsyncDisposable {
  readonly #events: T[] = [];
  readonly #waiters: Array<() => void> = [];
  readonly #maxLen: number;
  #disposed = false;

  public constructor(maxLen = 256) {
    this.#maxLen = maxLen;
  }

  public get count(): number {
    return this.#events.length;
  }

  public get snapshot(): StreamSnapshot<T> {
    return {
      size: this.#events.length,
      first: this.#events[0] ?? null,
      last: this.#events[this.#events.length - 1] ?? null,
    };
  }

  public emit(value: T): void {
    if (this.#disposed) return;
    this.#events.push(value);
    if (this.#events.length > this.#maxLen) {
      this.#events.shift();
    }

    const waiter = this.#waiters.shift();
    if (waiter) {
      waiter();
    }
  }

  public [Symbol.asyncIterator](): AsyncIterator<T> {
    const source = this;
    let cursor = 0;
    return {
      async next(): Promise<IteratorResult<T>> {
        for (;;) {
          if (source.#disposed) {
            return { done: true, value: undefined };
          }

          const nextValue = source.#events[cursor++];
          if (nextValue !== undefined) {
            return { done: false, value: nextValue };
          }

          await new Promise<void>((resolve) => {
            source.#waiters.push(resolve);
          });
        }
      },
    };
  }

  public toSorted(by: (left: T, right: T) => number): T[] {
    return [...this.#events].toSorted(by);
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    this.#disposed = true;
    for (const waiter of this.#waiters) {
      waiter();
    }
    this.#waiters.length = 0;
    this.#events.length = 0;
  }
}

export const mapIterableEvents = <T, U>(values: Iterable<T>, mapper: (value: T) => U): readonly U[] => {
  const iteratorFrom = (globalThis as { Iterator?: { from?: <V>(value: Iterable<V>) => IteratorChain<V> } }).Iterator?.from;
  if (!iteratorFrom) {
    return [...values].map(mapper);
  }

  return iteratorFrom(values)
    .map((value) => mapper(value))
    .toArray();
};

export const createLabEventStream = (): EventIteratorSource<LabRuntimeEvent> => {
  const events = new LabEventBuffer<LabRuntimeEvent>(512);
  return {
    count: events.count,
    snapshot: events.snapshot,
    emit(value: LabRuntimeEvent): void {
      events.emit(value);
    },
    [Symbol.asyncIterator]: events[Symbol.asyncIterator].bind(events),
    [Symbol.asyncDispose]: events[Symbol.asyncDispose].bind(events),
  };
};
