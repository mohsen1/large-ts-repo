import { Brand } from '@shared/type-level';
import type { StageVerb } from './types';

export type DiagnosticId = Brand<string, 'ScenarioDiagnosticId'>;

export interface StageSample<TMetrics extends Record<string, number> = Record<string, number>> {
  readonly stage: StageVerb;
  readonly elapsedMs: number;
  readonly metrics: TMetrics;
  readonly tags: readonly string[];
  readonly checkpoint: number;
}

export interface DiagnosticEvent<TData = unknown> {
  readonly id: DiagnosticId;
  readonly type: 'start' | 'snapshot' | 'error' | 'finish';
  readonly stage?: StageVerb;
  readonly payload: TData;
  readonly time: number;
}

export interface DiagnosticEnvelope<TData = unknown> {
  readonly runId: DiagnosticId;
  readonly events: readonly DiagnosticEvent<TData>[];
  readonly startedAt: number;
}

export function* diagnosticsIterator<TData>(events: readonly DiagnosticEvent<TData>[]): Generator<DiagnosticEvent<TData>> {
  for (const event of events) {
    yield event;
  }
}

export class ScenarioDiagnostics<TData = unknown> {
  readonly #events: DiagnosticEvent<TData>[] = [];
  readonly #startAt = Date.now();

  record(event: Omit<DiagnosticEvent<TData>, 'id' | 'time'> & { id?: DiagnosticId }): DiagnosticEvent<TData> {
    const entry: DiagnosticEvent<TData> = {
      ...event,
      id: event.id ?? (`diag-${Date.now()}` as DiagnosticId),
      time: Date.now(),
    };
    this.#events.push(entry);
    return entry;
  }

  sample<TMetrics extends Record<string, number> = Record<string, number>>(
    sample: Omit<StageSample<TMetrics>, 'checkpoint'>,
  ): DiagnosticEvent<StageSample<TMetrics>> {
    return this.record<StageSample<TMetrics>>({
      type: 'snapshot',
      payload: {
        ...sample,
        checkpoint: Date.now(),
      },
    });
  }

  get events(): readonly DiagnosticEvent<TData>[] {
    return [...this.#events];
  }

  summary() {
    const grouped = new Map<string, number>();
    for (const event of this.#events) {
      const key = event.type;
      grouped.set(key, (grouped.get(key) ?? 0) + 1);
    }

    return {
      startedAt: this.#startAt,
      envelopeId: `diag-${this.#startAt}` as DiagnosticId,
      elapsedMs: Date.now() - this.#startAt,
      totals: Object.fromEntries(grouped),
    };
  }

  recent(count = 10): readonly DiagnosticEvent<TData>[] {
    return this.#events.slice(-count);
  }

  findByType(type: DiagnosticEvent<TData>['type']): readonly DiagnosticEvent<TData>[] {
    return this.#events.filter((event) => event.type === type);
  }

  [Symbol.iterator](): IterableIterator<DiagnosticEvent<TData>> {
    return diagnosticsIterator(this.#events);
  }

  [Symbol.asyncDispose](): Promise<void> {
    this.#events.length = 0;
    return Promise.resolve();
  }

  [Symbol.dispose](): void {
    this.#events.length = 0;
  }
}

export async function collectDiagnostics<TData>(
  events: Iterable<DiagnosticEvent<TData>>,
): Promise<DiagnosticEnvelope<TData>> {
  const envelope = {
    runId: `run-${Date.now()}` as DiagnosticId,
    events: [] as DiagnosticEvent<TData>[],
    startedAt: Date.now(),
  };

  for (const event of events) {
    envelope.events.push(event);
    await Promise.resolve();
  }

  return envelope;
}

export function* mapIterator<TIn, TOut>(
  source: Iterable<TIn>,
  mapper: (value: TIn) => TOut,
): Generator<TOut> {
  for (const item of source) {
    yield mapper(item);
  }
}

export function filterIterator<T>(source: Iterable<T>, predicate: (value: T) => boolean): Generator<T> {
  return function* () {
    for (const value of source) {
      if (predicate(value)) {
        yield value;
      }
    }
  }();
}

export const diagnosticHelpers = {
  collectDiagnostics,
  diagnosticsIterator,
  mapIterator,
  filterIterator,
} as const;
