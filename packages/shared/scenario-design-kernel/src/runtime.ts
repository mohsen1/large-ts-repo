import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
import type { EventEnvelope } from './types';

interface RuntimeEnvelope {
  readonly id: string;
  readonly payload: unknown;
}

export interface RuntimeLifecycle {
  readonly startAt: number;
  readonly stopAt?: number;
  readonly metrics: {
    readonly elapsedMs: number;
    readonly peakHeapMb: number;
    readonly events: number;
  };
}

export type RuntimeEvent<TPayload extends object> = EventEnvelope<string, TPayload> & {
  readonly id: string;
};

const als = new AsyncLocalStorage<Map<string, unknown>>();

export class ScenarioRunScope {
  readonly #start = performance.now();
  readonly #events: RuntimeEnvelope[] = [];
  readonly #children = new AsyncDisposableStack();

  constructor(readonly namespace: string) {}

  run<T>(fn: () => Promise<T>): Promise<T> {
    return als.run(new Map(), () => this.#children.run(fn));
  }

  emit<TPayload extends object>(event: RuntimeEvent<TPayload>): void {
    this.#events.push({ id: event.version, payload: event.payload });
  }

  async close(): Promise<void> {
    await this.#children.disposeAsync();
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }

  report(): RuntimeLifecycle {
    return {
      startAt: this.#start,
      stopAt: performance.now(),
      metrics: {
        elapsedMs: performance.now() - this.#start,
        peakHeapMb: typeof performance.memory === 'object' ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) : 0,
        events: this.#events.length,
      },
    };
  }

  snapshot<T>(key: string, value: T): void {
    const store = als.getStore();
    store?.set(key, value as unknown);
  }

  lookup<T>(key: string): T | undefined {
    const store = als.getStore();
    return (store?.get(key) as T | undefined) ?? undefined;
  }
}

export async function withScenarioScope<T>(
  namespace: string,
  run: () => Promise<T>,
): Promise<{ scope: ScenarioRunScope; value: T }> {
  await using scope = new ScenarioRunScope(namespace);
  const value = await scope.run(run);
  return { scope, value };
}

export const runtimeDefaults = {
  namespace: 'recovery-scenario-design',
  disposeMs: 25,
  flushEvery: 100,
};
