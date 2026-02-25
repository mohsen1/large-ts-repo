import type { Brand } from '@shared/type-level';
import { type SignalEnvelope, type SignalKind, type UnixEpochMs } from './identity';
import { isKnownKind } from './identity';

export type EventShard<T extends string = string> = `${T}-shard`;
export type StreamCursor = Brand<number, 'StreamCursor'>;

export interface SimulationEnvelopeStreamState {
  readonly runToken: string;
  readonly namespace: string;
  readonly cursor: StreamCursor;
  readonly drained: boolean;
}

export interface SimulationSignalChunk<TValue = unknown> {
  readonly streamId: string;
  readonly cursor: StreamCursor;
  readonly signals: readonly TValue[];
  readonly drainedAt?: UnixEpochMs;
}

export type BatchTransformer<TInput, TOutput> = (value: TInput, cursor: StreamCursor) => TOutput;

export interface StreamOptions<T extends object = object> {
  readonly batchSize: number;
  readonly includeMeta?: boolean;
  readonly initialCursor?: number;
  readonly transform?: BatchTransformer<T, T>;
}

export type StreamResult<T> = {
  next: StreamState<T>;
  values: readonly T[];
};

export type StreamState<T> = {
  cursor: StreamCursor;
  exhausted: boolean;
  pending: readonly T[];
};

export function makeCursor<T extends number>(value: T): StreamCursor {
  return Math.max(0, Math.floor(value)) as StreamCursor;
}

async function* batchIterator<T>(
  items: Iterable<T>,
  batchSize: number,
  initialCursor: number
): AsyncGenerator<SimulationSignalChunk<T>, void, unknown> {
  const chunk: T[] = [];
  let cursor = makeCursor(initialCursor);
  for (const item of items) {
    chunk.push(item);
    if (chunk.length >= batchSize) {
      const nextCursor = makeCursor((cursor as number) + chunk.length);
      yield {
        streamId: 'chaos-sim-stream',
        cursor,
        signals: chunk as readonly T[],
        drainedAt: undefined
      };
      cursor = nextCursor;
      chunk.length = 0;
    }
  }

  if (chunk.length > 0) {
    yield {
      streamId: 'chaos-sim-stream',
      cursor,
      signals: chunk as readonly T[],
      drainedAt: Date.now() as UnixEpochMs
    };
  }
}

export async function streamSignalBatches<T>(
  signals: readonly T[],
  options: Partial<StreamOptions> = {}
): Promise<ReadonlyArray<SimulationSignalChunk<T>>> {
  const batchSize = options.batchSize ?? 16;
  const initialCursor = options.initialCursor ?? 0;
  const chunks: SimulationSignalChunk<T>[] = [];
  for await (const chunk of batchIterator(signals, batchSize, initialCursor)) {
    chunks.push(chunk);
  }
  return chunks;
}

export async function collectFilteredSignals(
  signals: AsyncIterable<SignalEnvelope<unknown>>,
  kinds: readonly SignalKind[],
  limit = Number.MAX_SAFE_INTEGER
): Promise<readonly SignalEnvelope<unknown>[]> {
  const selected = new Set(kinds);
  const collected: readonly (SignalEnvelope<unknown> | undefined)[] = [];
  for await (const signal of signals) {
    const root = signal.kind.split('::')[0];
    if (!isKnownKind(root)) {
      continue;
    }
    if (!selected.has(root as SignalKind)) {
      continue;
    }
    (collected as Array<SignalEnvelope<unknown> | undefined>).push(signal);
  }

  return (collected
    .filter((signal): signal is SignalEnvelope<unknown> => signal !== undefined) as readonly SignalEnvelope<unknown>[])
    .slice(0, limit);
}

export function splitChunk<T>(chunk: SimulationSignalChunk<T>, parts = 2): readonly SimulationSignalChunk<T>[] {
  const out: SimulationSignalChunk<T>[] = [];
  const sliceSize = Math.max(1, Math.ceil(chunk.signals.length / Math.max(parts, 1)));
  for (let offset = 0; offset < chunk.signals.length; offset += sliceSize) {
    const partial = chunk.signals.slice(offset, offset + sliceSize);
    out.push({
      streamId: chunk.streamId,
      cursor: makeCursor(Number(chunk.cursor) + offset),
      signals: partial
    });
  }
  return out;
}

export function materializeState<T>(
  chunks: readonly SimulationSignalChunk<T>[]
): StreamState<T> {
  const cursor = chunks.at(-1)?.cursor ?? (0 as StreamCursor);
  return {
    cursor,
    exhausted: chunks.length > 0 && chunks.at(-1)?.drainedAt !== undefined,
    pending: chunks.flatMap((chunk) => chunk.signals)
  };
}
