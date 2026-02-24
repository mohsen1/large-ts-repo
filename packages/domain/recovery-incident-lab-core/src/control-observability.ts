import type { IncidentLabRun, IncidentLabSignal } from './types';
import {
  type ControlEventName,
  type ControlTimelineBucket,
  type ControlRunResult,
  createControlRunId,
  mergePolicyWarnings,
  type ControlEvent,
} from './control-orchestration-types';

export type TimelineChunk<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? readonly [Head, ...TimelineChunk<Tail>]
  : readonly [];

export type TimelineIndex<T extends readonly unknown[]> = T extends readonly [
  infer _Head,
  ...infer Tail
] ? [0, ...TimelineIndex<Tail>] : readonly [];

export interface TimelineWindow {
  readonly bucket: ControlTimelineBucket;
  readonly events: readonly ControlEvent[];
  readonly score: number;
  readonly at: string;
}

export interface TimelineEnvelope {
  readonly id: string;
  readonly runId: ControlRunResult['runId'];
  readonly windows: readonly TimelineWindow[];
  readonly totalScore: number;
  readonly warnings: readonly string[];
}

export interface ObservationRecord<TPayload = unknown> {
  readonly eventName: ControlEventName<any, any, any>;
  readonly runId: string;
  readonly payload: TPayload;
  readonly at: string;
}

export class ObservationSession<T> implements AsyncDisposable {
  readonly #buffer: T[] = [];
  readonly #runId: string;
  readonly #createdAt: string;
  constructor(runId: string) {
    this.#runId = runId;
    this.#createdAt = new Date().toISOString();
  }

  [Symbol.asyncDispose](): Promise<void> {
    this.#buffer.length = 0;
    return Promise.resolve();
  }

  get runId(): string {
    return this.#runId;
  }

  get createdAt(): string {
    return this.#createdAt;
  }

  push(record: T): void {
    this.#buffer.push(record);
  }

  entries(): readonly T[] {
    return [...this.#buffer];
  }
}

export const buildTimelineChunk = <T, const TChunks extends readonly T[]>(
  chunks: TChunks,
): TimelineChunk<TChunks> =>
  chunks.map((chunk) => chunk) as unknown as TimelineChunk<TChunks>;

export const toObservationStream = function* <T>(
  values: readonly T[],
): Generator<ObservationRecord<T>, void, void> {
  let index = 0;
  for (const value of values) {
    yield {
      eventName: `lab:runtime:observe:${index}` as ControlEventName<'runtime', 'observe', number>,
      runId: createControlRunId('session'),
      payload: value,
      at: new Date().toISOString(),
    };
    index += 1;
  }
};

export const toAsyncObservationStream = async function* <T>(
  values: Iterable<T>,
): AsyncGenerator<ObservationRecord<T>, void, void> {
  let index = 0;
  for (const value of values) {
    await Promise.resolve();
    yield {
      eventName: `lab:runtime:observe:${index}` as ControlEventName<'runtime', 'observe', number>,
      runId: createControlRunId('session'),
      payload: value,
      at: new Date().toISOString(),
    };
    index += 1;
  }
};

export const buildControlTimeline = async <TSignal extends IncidentLabSignal['kind']>(
  run: IncidentLabRun,
  events: readonly ControlEvent[],
  warnings: readonly string[],
): Promise<TimelineEnvelope> => {
  const runId = run.runId;
  const buckets: Record<string, ControlEvent[]> = {};
  for (const event of events) {
    const existing = buckets[event.bucket] ?? [];
    buckets[event.bucket] = [...existing, event];
  }

  const windows = Object.entries(buckets).map<TimelineWindow>(([bucket, entries]) => {
    const score = entries.length === 0 ? 0 : entries.length / (events.length || 1);
    const sortedEntries = entries.toSorted((left, right) => left.emittedAt.localeCompare(right.emittedAt));
    const byKind = new Map<string, number>();
    for (const entry of sortedEntries) {
      byKind.set(entry.name, (byKind.get(entry.name) ?? 0) + 1);
    }
    const warningsLocal = [...byKind.entries()].map(([kind, count]) => `${kind}:${count}`);
    return {
      bucket: bucket as ControlTimelineBucket,
      events: sortedEntries,
      score: score * 100,
      at: sortedEntries[0]?.emittedAt ?? run.results[0]?.finishAt ?? new Date().toISOString(),
    };
  });

  return {
    id: String(run.runId),
    runId,
    windows,
    totalScore: windows.reduce((sum, entry) => sum + entry.score, 0),
    warnings: mergePolicyWarnings(warnings, windows.flatMap((window) => window.events.map((entry) => `event:${entry.name}`))),
  };
};

export const collectSignalBatches = async <TSignals extends readonly IncidentLabSignal[]>(
  signals: TSignals,
): Promise<readonly {
  readonly kind: IncidentLabSignal['kind'];
  readonly bucket: `batch:${number}`;
  readonly values: readonly number[];
}[]> => {
  const batches: {
    [key: string]: number[];
  } = {};
  for (const signal of signals) {
    const batchKey = `${signal.kind}-${Math.floor(signal.value % 3)}`;
    batches[batchKey] = [...(batches[batchKey] ?? []), signal.value];
  }
  return Object.entries(batches)
    .map(([key, values]) => ({
      kind: key.split('-')[0] as IncidentLabSignal['kind'],
      bucket: `batch:${key}` as `batch:${number}`,
      values,
    }))
    .toSorted((left, right) => left.kind.localeCompare(right.kind));
};
