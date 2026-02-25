import {
  streamSignalBatches,
  collectFilteredSignals,
  materializeState,
  type SignalEnvelope,
  type SignalKind,
  type SignalKindRoute,
  type SignalPriority,
  type UnixEpochMs,
  asScenarioId,
  asSimulationId,
  asNamespace
} from '@domain/recovery-chaos-sim-models';
import { type Brand } from '@shared/type-level';

export type SignalBucketId = Brand<string, 'SignalBucketId'>;

export interface SignalBatchRow {
  readonly streamId: string;
  readonly cursor: number;
  readonly value: number;
  readonly namespace: string;
  readonly kind: string;
}

export interface SignalBucket {
  readonly id: SignalBucketId;
  readonly count: number;
  readonly average: number;
  readonly spike: number;
}

export interface SignalAnalysis {
  readonly namespace: string;
  readonly buckets: readonly SignalBucket[];
  readonly total: number;
}

const KNOWN_KINDS = ['infra', 'platform', 'application', 'workflow', 'human'] as const;

type KnownKind = typeof KNOWN_KINDS[number];

type SignalEnvelopeIterable = AsyncIterable<SignalEnvelope<SignalBatchRow, SignalKind>>;

function toSignalKind(raw: string): KnownKind {
  const normalized = raw.toLowerCase();
  if ((KNOWN_KINDS as readonly string[]).includes(normalized)) {
    return normalized as KnownKind;
  }
  return 'infra';
}

function toSignalRows(rows: readonly SignalBatchRow[]): readonly SignalEnvelope<SignalBatchRow, SignalKind>[] {
  return rows.map((row) => {
    const normalizedKind = toSignalKind(row.kind);
    const kind = `${normalizedKind}::${normalizedKind.toUpperCase()}` as SignalKindRoute<typeof normalizedKind>;
    const priority = Math.max(0, Math.min(4, Math.floor(row.value))) as SignalPriority;
    return {
      kind,
      priority,
      namespace: asNamespace(row.namespace),
      simulationId: asSimulationId(row.kind),
      scenarioId: asScenarioId(row.kind),
      payload: row,
      at: Date.now() as UnixEpochMs
    };
  });
}

function percentile(values: readonly number[], ratio: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].toSorted((left, right) => left - right);
  const clamped = Math.min(1, Math.max(0, ratio));
  return sorted[Math.floor((sorted.length - 1) * clamped)] ?? 0;
}

function asSignalIterable(signals: readonly SignalEnvelope<SignalBatchRow, SignalKind>[]): SignalEnvelopeIterable {
  return {
    async *[Symbol.asyncIterator]() {
      for (const signal of signals) {
        yield signal;
      }
    }
  };
}

export async function analyzeSignalRows(rows: readonly SignalBatchRow[]): Promise<SignalAnalysis> {
  const sourceRows = toSignalRows(rows);
  const rawChunks = await streamSignalBatches(sourceRows, { batchSize: 16 });
  const state = materializeState(rawChunks);
  const samples = state.pending.map((item) => Number(item.payload.value) || 0);
  const grouped = state.pending.map((item) => item.kind);

  const selected = await collectFilteredSignals(asSignalIterable(state.pending), KNOWN_KINDS, 1000);

  const chunks = Math.max(1, Math.ceil(samples.length / Math.max(selected.length, 1)));
  const buckets = Array.from({ length: Math.max(1, Math.ceil(samples.length / chunks)) }, (_entry, index) => {
    const window = samples.slice(index * chunks, (index + 1) * chunks);
    const average = window.length === 0 ? 0 : window.reduce((sum, value) => sum + value, 0) / window.length;
    const spike = percentile(window, 0.96);
    return {
      id: `${grouped[index] ?? 'bucket'}:${index}` as SignalBucketId,
      count: window.length,
      average,
      spike
    };
  });

  return {
    namespace: rows[0]?.namespace ?? 'default',
    buckets,
    total: selected.length
  };
}
