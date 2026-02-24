import { createAsyncScope, createSyncScope } from './scope';

export interface StudioEvent<TPayload> {
  readonly id: string;
  readonly kind: 'progress' | 'diagnostic' | 'warning' | 'error';
  readonly pluginId: string;
  readonly pluginName: string;
  readonly payload: TPayload;
  readonly at: string;
}

interface QueueItem<TPayload> {
  readonly event?: StudioEvent<TPayload>;
  readonly done: boolean;
}

export interface StudioEventBus<TPayload> extends AsyncIterable<StudioEvent<TPayload>> {
  publish(event: StudioEvent<TPayload>): void;
  close(): void;
  size(): number;
  readonly isClosed: boolean;
}

export class RecoveryStudioEventBus<TPayload>
  implements StudioEventBus<TPayload>, AsyncIterable<StudioEvent<TPayload>>, Iterable<StudioEvent<TPayload>>
{
  #closed = false;
  #events: Array<StudioEvent<TPayload>> = [];
  #listeners: Array<(event: StudioEvent<TPayload>) => void> = [];
  #waiters: Array<(item: QueueItem<TPayload>) => void> = [];

  constructor() {
    const scope = createSyncScope();
    scope.defer(() => {
      if (!this.#closed) {
        this.close();
      }
    });
    using _scope = scope;
  }

  get isClosed() {
    return this.#closed;
  }

  size(): number {
    return this.#events.length;
  }

  publish(event: StudioEvent<TPayload>): void {
    if (this.#closed) {
      return;
    }

    this.#events.push(event);
    const waiter = this.#waiters.shift();
    if (waiter) {
      waiter({ event, done: false });
      return;
    }

    for (const listener of this.#listeners) {
      listener(event);
    }
  }

  close(): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    let waiter: ((item: QueueItem<TPayload>) => void) | undefined;
    while ((waiter = this.#waiters.shift())) {
      waiter({ done: true, event: undefined });
    }
    this.#waiters.length = 0;
    this.#listeners.length = 0;
  }

  [Symbol.iterator](): Iterator<StudioEvent<TPayload>> {
    const snapshot = this.#events.slice();
    let index = 0;
    return {
      next: () =>
        index < snapshot.length
          ? { value: snapshot[index++], done: false }
          : { value: undefined, done: true },
    };
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<StudioEvent<TPayload>, void, undefined> {
    let index = 0;
    while (true) {
      if (index < this.#events.length) {
        yield this.#events[index];
        index += 1;
        continue;
      }

      if (this.#closed) {
        return;
      }

      const next = await new Promise<QueueItem<TPayload>>((resolve) => {
        this.#waiters.push(resolve);
      });

      if (next.done) {
        return;
      }
      if (next.event) {
        yield next.event;
        index += 1;
      }
    }
  }

  [Symbol.dispose](): void {
    this.close();
  }

  [Symbol.asyncDispose](): Promise<void> {
    const scope = createAsyncScope();
    scope.defer(() => {
      this.close();
    });
    return scope[Symbol.asyncDispose]();
  }
}
