import { type EventRecord } from '@shared/cascade-orchestration-kernel';

interface BusContext {
  stop: () => void;
  [Symbol.dispose](): void;
}

const createBusContext = (stop: () => void): BusContext => ({
  stop,
  [Symbol.dispose]: stop,
});

export class CascadeEventBus {
  #listeners = new Set<(event: EventRecord) => void>();
  #queue: EventRecord[] = [];
  #closed = false;

  emit(event: EventRecord): void {
    if (this.#closed) return;
    this.#queue.push(event);
    for (const listener of this.#listeners) {
      listener(event);
    }
  }

  subscribe(handler: (event: EventRecord) => void): BusContext {
    this.#listeners.add(handler);
    return createBusContext(() => {
      this.#listeners.delete(handler);
    });
  }

  drain(limit = 128): EventRecord[] {
    const items = this.#queue.slice(0, limit);
    this.#queue = this.#queue.slice(limit);
    return items;
  }

  close() {
    this.#closed = true;
    this.#listeners.clear();
    this.#queue.length = 0;
  }

  [Symbol.dispose](): void {
    this.close();
  }
}

export const createCascadeEventBus = (): CascadeEventBus => new CascadeEventBus();

export const collectEventsFromBus = async (
  bus: CascadeEventBus,
  count: number,
  windowMs: number,
): Promise<EventRecord[]> => {
  const deadline = performance.now() + windowMs;
  while (performance.now() < deadline && bus.drain().length < count) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return bus.drain(count);
};
