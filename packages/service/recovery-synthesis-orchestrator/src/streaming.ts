import type { QuantumRuntimeEvent } from './quantum-runtime';

export interface StreamFrame<TPayload = unknown> {
  readonly index: number;
  readonly at: string;
  readonly payload: TPayload;
}

export async function* simulateFrames(events: Iterable<QuantumRuntimeEvent>): AsyncGenerator<StreamFrame<QuantumRuntimeEvent>> {
  let index = 0;
  const replay = [...events];
  for (const event of replay) {
    yield {
      index,
      at: new Date().toISOString(),
      payload: event,
    };
    index += 1;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

export async function collectStream<T>(source: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of source) {
    out.push(item);
  }
  return out;
}

export class EventAccumulator<T> {
  readonly #items: T[] = [];

  push(item: T): void {
    this.#items.push(item);
  }

  get items(): readonly T[] {
    return this.#items;
  }
}
