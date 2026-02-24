import { chain } from '@shared/orchestration-kernel';
import type { NoInfer } from '@shared/type-level';
import type { DesignSignalKind, DesignStage, DesignPlanId, PlanSignal } from './contracts';

export interface RawSignalEnvelope<T = unknown, TMetric extends DesignSignalKind = DesignSignalKind> {
  readonly runId: DesignPlanId;
  readonly metric: TMetric;
  readonly stage: DesignStage;
  readonly sequence: number;
  readonly timestamp: string;
  readonly payload: T;
}

export interface NormalizedSignal {
  readonly runId: DesignPlanId;
  readonly id: string;
  readonly metric: DesignSignalKind;
  readonly stage: DesignStage;
  readonly value: number;
  readonly at: number;
  readonly path: `signal/${DesignSignalKind}/${DesignStage}`;
}

export type SignalBuckets = {
  [K in `bucket:${DesignSignalKind}`]?: readonly NormalizedSignal[];
};

const normalizeValue = (raw: unknown): number => {
  const numeric = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return numeric;
};

const signalPath = (runId: DesignPlanId, metric: DesignSignalKind, stage: DesignStage): `signal/${DesignSignalKind}/${DesignStage}` =>
  `signal/${metric}/${stage}`;

const signalValue = (payload: unknown): number => {
  if (typeof payload === 'number' || typeof payload === 'string') {
    return normalizeValue(payload);
  }
  if (typeof payload === 'object' && payload !== null && 'value' in payload) {
    return normalizeValue((payload as { readonly value?: unknown }).value);
  }
  return normalizeValue(payload);
};

const toSignal = (input: RawSignalEnvelope): NormalizedSignal => ({
  runId: input.runId,
  id: `${input.runId}:${input.metric}:${input.sequence}:${input.stage}`,
  metric: input.metric,
  stage: input.stage,
  value: signalValue(input.payload),
  at: Date.now() + input.sequence,
  path: signalPath(input.runId, input.metric, input.stage),
});

export const normalizeSignals = <T extends readonly RawSignalEnvelope[]>(
  signals: NoInfer<T>,
): readonly NormalizedSignal[] => {
  return [...signals].map((signal) => toSignal(signal)).toSorted((left, right) => right.at - left.at);
};

export const splitSignals = (signals: readonly NormalizedSignal[]): {
  readonly byMetric: SignalBuckets;
  readonly sorted: readonly NormalizedSignal[];
} => {
  const ordered = [...signals].toSorted((left, right) => right.at - left.at);
  const buckets = ordered.reduce<Record<string, NormalizedSignal[]>>(
    (acc, signal) => {
      const key = `bucket:${signal.metric}` as keyof SignalBuckets;
      acc[key] = [...(acc[key] ?? []), signal];
      return acc;
    },
    {} as Record<string, NormalizedSignal[]>,
  );
  return {
    byMetric: buckets as unknown as SignalBuckets,
    sorted: ordered,
  };
};

export interface SignalWindow {
  readonly from: number;
  readonly to: number;
  readonly count: number;
  readonly average: number;
}

const atOf = (signal: RawSignalEnvelope | NormalizedSignal): number =>
  'at' in signal && typeof signal.at === 'number' && Number.isFinite(signal.at)
    ? signal.at
    : Date.parse((signal as RawSignalEnvelope).timestamp);

export function collectWindows(signals: readonly RawSignalEnvelope[], bucketSize?: number): readonly SignalWindow[];
export function collectWindows(signals: readonly NormalizedSignal[], bucketSize?: number): readonly SignalWindow[];
export function collectWindows(
  signals: readonly (RawSignalEnvelope | NormalizedSignal)[],
  bucketSize = 4,
): readonly SignalWindow[] {
  const points = chain(signals)
    .map(atOf)
    .toArray()
    .filter((value) => Number.isFinite(value))
    .toSorted((left, right) => left - right);
  const windows: SignalWindow[] = [];
  for (let index = 0; index < points.length; index += bucketSize) {
    const slice = points.slice(index, index + bucketSize);
    const count = slice.length;
    const average = slice.reduce((acc, value) => acc + value, 0) / Math.max(1, count);
    windows.push({
      from: slice[0] ?? 0,
      to: slice[slice.length - 1] ?? 0,
      count,
      average,
    });
  }
  return windows;
};

export async function* signalIterator<T extends PlanSignal>(
  events: AsyncIterable<T> | Iterable<T>,
  batchSize = 2,
): AsyncIterableIterator<readonly NormalizedSignal[]> {
  const queue: T[] = [];
  const emit = async function* () {
    while (queue.length > 0) {
      const slice = queue.splice(0, batchSize);
      const batch = slice.map((entry, index) => ({
        runId: entry.runId,
        metric: entry.metric,
        stage: entry.stage,
        sequence: index,
        timestamp: new Date(entry.timestamp).toISOString(),
        payload: { value: entry.value },
      }));
      yield normalizeSignals(batch);
    }
  };

  if (typeof (events as AsyncIterable<T>)[Symbol.asyncIterator] === 'function') {
    for await (const event of events as AsyncIterable<T>) {
      queue.push(event);
      yield* emit();
    }
  } else {
    for (const event of events as Iterable<T>) {
      queue.push(event);
      yield* emit();
    }
  }
}
