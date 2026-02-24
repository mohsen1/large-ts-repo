import { collectIterable, mapIterable } from '@shared/stress-lab-runtime';
import type { ConvergenceRunId } from './types';

export type TelemetryEventName =
  | 'plugin.started'
  | 'plugin.skipped'
  | 'plugin.completed'
  | 'plugin.failed'
  | 'workflow.completed';

export interface TelemetryEvent {
  readonly runId: ConvergenceRunId;
  readonly name: TelemetryEventName;
  readonly at: string;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface TelemetrySnapshot {
  readonly runId: ConvergenceRunId;
  readonly count: number;
  readonly details: readonly string[];
}

export class ConvergenceTelemetry {
  readonly #events: TelemetryEvent[] = [];
  #disposed = false;

  constructor(readonly runId: ConvergenceRunId) {}

  push(name: TelemetryEventName, details: Readonly<Record<string, unknown>>): void {
    if (this.#disposed) return;

    this.#events.push({
      runId: this.runId,
      name,
      at: new Date().toISOString(),
      details,
    });
  }

  snapshot(): TelemetrySnapshot {
    const details = this.#events.map((event) => `${event.name}=${event.at}`);
    return {
      runId: this.runId,
      count: this.#events.length,
      details,
    };
  }

  records(): readonly TelemetryEvent[] {
    return [...this.#events];
  }

  [Symbol.dispose](): void {
    this.#disposed = true;
  }

  [Symbol.asyncDispose](): Promise<void> {
    this.#disposed = true;
    return Promise.resolve();
  }
}

export const withConvergenceTelemetry = async <T>(
  runId: ConvergenceRunId,
  callback: (telemetry: ConvergenceTelemetry) => Promise<T>,
): Promise<T> => {
  await using stack = new AsyncDisposableStack();
  const telemetry = new ConvergenceTelemetry(runId);
  stack.defer(async () => {
    telemetry.push('workflow.completed', { completed: true, count: telemetry.snapshot().count });
    for (const event of telemetry.records()) {
      void event;
    }
  });

  return callback(telemetry);
};

export const summarizeTelemetry = async (telemetry: ConvergenceTelemetry): Promise<string> => {
  const names = collectIterable(mapIterable(telemetry.records(), (entry) => entry.name));
  const lines = [...names].map((name, index) => `${index}:${name}`);
  return `telemetry:${lines.join(',')}`;
};

