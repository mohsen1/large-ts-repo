import type { AsyncLikeIterable } from '@shared/typed-orchestration-core';
import { chunkAsync, collectArray, mapAsync, toAsyncIterable } from '@shared/typed-orchestration-core';
import type { EcosystemEvent } from './events.js';

export interface EventEnvelope {
  readonly timestamp: string;
  readonly event: EcosystemEvent;
}

export interface EventSink {
  emit(event: EcosystemEvent): Promise<void>;
  finalize?(): Promise<void>;
}

export class EventCollector {
  readonly #events: EcosystemEvent[] = [];

  public record(event: EcosystemEvent): void {
    this.#events.push(event);
  }

  public snapshot(): readonly EcosystemEvent[] {
    return [...this.#events];
  }

  public clear(): void {
    this.#events.length = 0;
  }
}

export class EventBus implements EventSink, AsyncDisposable {
  readonly #collectors: EventCollector[] = [];
  readonly #stream: EcosystemEvent[] = [];
  #disposed = false;

  public addCollector(collector: EventCollector): () => void {
    this.#collectors.push(collector);
    return () => {
      const index = this.#collectors.indexOf(collector);
      if (index >= 0) {
        this.#collectors.splice(index, 1);
      }
    };
  }

  public async emit(event: EcosystemEvent): Promise<void> {
    if (this.#disposed) {
      return;
    }
    this.#stream.push(event);
    for (const collector of this.#collectors) {
      collector.record(event);
    }
  }

  public async drain(): Promise<void> {
    this.#stream.length = 0;
  }

  public stream(): AsyncIterable<EventEnvelope> {
    const iter = this.#stream.map((event) => ({ timestamp: new Date().toISOString(), event }));
    return toAsyncIterable(iter);
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    this.#disposed = true;
    this.#stream.length = 0;
    this.#collectors.length = 0;
    await Promise.resolve();
  }
}

export const summarizeEvents = async (
  events: AsyncLikeIterable<EcosystemEvent>,
): Promise<ReadonlyMap<string, number>> => {
  const buckets = new Map<string, number>();
  for await (const event of events) {
    const bucket = buckets.get('total') ?? 0;
    buckets.set('total', bucket + 1);
  }
  return buckets;
};

export const eventDurations = async (
  source: AsyncLikeIterable<EcosystemEvent>,
): Promise<readonly { readonly pluginName: string; readonly count: number }[]> => {
  const list = await collectArray(source);
  const counts = new Map<string, number>();
  for (const event of list) {
    const current = counts.get(event.pluginId) ?? 0;
    counts.set(event.pluginId, current + 1);
  }
  const entries = Array.from(counts.entries()).map(([pluginName, count]) => ({ pluginName, count }));
  return entries.toSorted((left, right) => left.count - right.count);
};

export const eventSignals = async (
  source: AsyncLikeIterable<EcosystemEvent>,
  transform: (event: EcosystemEvent) => string,
): Promise<readonly string[]> => {
  return collectArray(
    mapAsync(source, async (event, index: number) => `${index}:${transform(event)}`),
  );
};

export const compactBatches = async (
  source: AsyncLikeIterable<EcosystemEvent>,
): Promise<readonly ReadonlyArray<EventEnvelope>[]> => {
  const events = toAsyncIterable(source);
  const chunks = chunkAsync(events, 16);
  const out: ReadonlyArray<EventEnvelope>[] = [];
  for await (const chunk of chunks) {
    const wrapped: EventEnvelope[] = chunk.map((event: EcosystemEvent) => ({
      timestamp: new Date().toISOString(),
      event,
    }));
    out.push(wrapped);
  }
  return out;
};
