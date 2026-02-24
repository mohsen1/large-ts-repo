import type { SagaContext, SagaEventEnvelope, SagaEventTag, SagaNamespace, SagaPhase } from './types';
import { Brand, withBrand } from '@shared/core';

type Listener<T> = (event: T) => void;
type RuntimeEvent<TPayload = unknown> = SagaEventEnvelope<SagaNamespace, TPayload>;
type EventKey<TEvents extends Record<string, unknown>> = keyof TEvents & string;
type ListenerRegistry<TEvents extends Record<string, unknown>> = Map<EventKey<TEvents>, Set<Listener<SagaEventEnvelope>>>;

interface BusLifecycleResult {
  readonly accepted: number;
  readonly queueBefore: number;
  readonly queueAfter: number;
}

export interface SagaEventBusListener<T> {
  on(event: T): void;
}

export class SagaEventBus<TEvents extends Record<string, unknown>> {
  readonly #listeners: ListenerRegistry<TEvents> = new Map();
  readonly #all = new Set<Listener<RuntimeEvent<unknown>>>();
  readonly #queue: SagaEventEnvelope[] = [];

  publish<K extends keyof TEvents & string>(
    kind: K,
    payload: TEvents[K],
    context: SagaContext,
    tags: readonly SagaEventTag[] = [],
  ): BusLifecycleResult {
    const event: SagaEventEnvelope<SagaNamespace, TEvents[K]> = {
      eventId: withBrand(`${context.runId}-${kind}-${Date.now()}`, 'event:saga:runtime'),
      namespace: context.runNamespace,
      kind: `${context.runNamespace}::${context.phase}`,
      payload,
      recordedAt: new Date().toISOString(),
      tags: [...tags, `tag:${context.phase}`],
    };
    const queueBefore = this.#queue.length;
    this.#queue.push(event);

    const kindListeners = this.#listeners.get(kind) ?? new Set<Listener<SagaEventEnvelope>>();
    for (const listener of kindListeners) {
      listener(event);
    }
    for (const listener of this.#all) {
      listener(event);
    }

    return {
      accepted: kindListeners.size + this.#all.size,
      queueBefore,
      queueAfter: this.#queue.length,
    };
  }

  subscribe<K extends keyof TEvents & string>(
    kind: K,
    listener: Listener<SagaEventEnvelope<SagaNamespace, TEvents[K]>>,
  ): () => void {
    const current: Set<Listener<SagaEventEnvelope>> = this.#listeners.get(kind) ?? new Set();
    current.add(listener as Listener<SagaEventEnvelope>);
    this.#listeners.set(kind, current);
    return () => {
      current.delete(listener as Listener<SagaEventEnvelope>);
    };
  }

  subscribeAll(listener: Listener<SagaEventEnvelope>): () => void {
    this.#all.add(listener);
    return () => {
      this.#all.delete(listener);
    };
  }

  drain(): SagaEventEnvelope[] {
    const events = [...this.#queue];
    this.#queue.length = 0;
    return events;
  }

  async *stream(phases: readonly SagaPhase[] = []): AsyncGenerator<SagaEventEnvelope> {
    const allowed = new Set<SagaPhase>(phases);
    const snapshot = [...this.#queue];
    for (const event of snapshot) {
      if (allowed.size === 0 || allowed.has(event.kind.split('::')[1] as SagaPhase)) {
        await Promise.resolve();
        yield event;
      }
    }
  }

  collect(phases: readonly SagaPhase[]): SagaEventEnvelope[] {
    if (phases.length === 0) {
      return [...this.#queue];
    }
    const phaseSet = new Set<SagaPhase>(phases);
    return this.#queue.filter((event) => phaseSet.has(event.kind.split('::')[1] as SagaPhase));
  }
}
