import type { ConvergenceLifecycle, ConvergenceRunId, ConvergenceSummary } from '@domain/recovery-ops-orchestration-lab/src/convergence-studio/types';

export interface StudioEvent {
  readonly kind: 'trace' | 'error' | 'metric';
  readonly runId: ConvergenceRunId;
  readonly at: number;
  readonly payload: Record<string, unknown>;
}

export interface TelemetryWindow {
  readonly runId: ConvergenceRunId;
  readonly lifecycle: ConvergenceLifecycle;
  readonly startedAt: number;
  readonly endedAt?: number;
  readonly events: readonly StudioEvent[];
}

export class StudioTelemetryBus {
  #events: StudioEvent[] = [];
  #startedAt = Date.now();

  pushTrace(runId: ConvergenceRunId, payload: Record<string, unknown>): void {
    this.#events.push({ kind: 'trace', runId, at: Date.now(), payload });
  }

  pushMetric(runId: ConvergenceRunId, payload: Record<string, unknown>): void {
    this.#events.push({ kind: 'metric', runId, at: Date.now(), payload });
  }

  pushError(runId: ConvergenceRunId, payload: Record<string, unknown>): void {
    this.#events.push({ kind: 'error', runId, at: Date.now(), payload });
  }

  window(runId: ConvergenceRunId, lifecycle: ConvergenceLifecycle): TelemetryWindow {
    return {
      runId,
      lifecycle,
      startedAt: this.#startedAt,
      endedAt: Date.now(),
      events: [...this.#events],
    };
  }

  reduceErrors(): number {
    return this.#events.reduce((acc, event) => acc + (event.kind === 'error' ? 1 : 0), 0);
  }

  snapshot(summary: ConvergenceSummary): string {
    const errors = this.reduceErrors();
    return `${summary.runId}::${summary.workspaceId}::errors:${errors}::score:${summary.score}`;
  }

  clear(): void {
    this.#events = [];
  }
}

export const toEventIterator = (events: readonly StudioEvent[]): IterableIterator<StudioEvent> => {
  let index = 0;
  return {
    [Symbol.iterator](): IterableIterator<StudioEvent> {
      return this;
    },
    next(): IteratorResult<StudioEvent> {
      if (index >= events.length) {
        return { done: true, value: undefined };
      }
      const value = events[index]!;
      index += 1;
      return { done: false, value };
    },
  };
};

export async function* toAsyncEventStream(events: Iterable<StudioEvent>): AsyncGenerator<StudioEvent> {
  for (const event of events) {
    await Promise.resolve();
    yield event;
  }
}

export const summarizeTelemetry = async (events: Iterable<StudioEvent>): Promise<string> => {
  const counts = { trace: 0, metric: 0, error: 0 };
  for await (const event of toAsyncEventStream(events)) {
    counts[event.kind] += 1;
  }
  return Object.entries(counts)
    .map(([kind, count]) => `${kind}=${count}`)
    .join(',');
};
