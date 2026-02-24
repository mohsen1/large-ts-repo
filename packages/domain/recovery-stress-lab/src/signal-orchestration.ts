import { z } from 'zod';
import { type NoInfer } from '@shared/type-level';
import {
  type RecoverySignal,
  type RecoverySignalId,
  type StageSignal,
  type SeverityBand,
  createSignalId,
  type TenantId,
} from './models';

interface IteratorChain<T> {
  map<U>(transform: (value: T) => U): { toArray(): U[] };
  filter(predicate: (value: T) => boolean): { toArray(): T[] };
  toArray(): T[];
}

const iteratorFrom =
  (globalThis as {
    readonly Iterator?: {
      from?: <T>(value: Iterable<T>) => IteratorChain<T>;
    };
  }).Iterator?.from;

const rawSignalShape = {
  id: z.string().min(1),
  class: z.enum(['availability', 'integrity', 'performance', 'compliance']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  title: z.string().min(1),
  createdAt: z.string(),
  metadata: z.record(z.string(), z.unknown()),
} satisfies Record<string, z.ZodTypeAny>;

const rawSignalSchema = z.object(rawSignalShape);
const rawSignalBatchSchema = z.array(rawSignalSchema);

export type ParsedSignalDigest<TSignals extends readonly StageSignal[]> = {
  readonly raw: TSignals;
  readonly signature: string;
};

export interface SignalWindowRecord {
  readonly window: string;
  readonly signals: readonly RecoverySignal[];
}

export type SignalWindowMap = {
  readonly [K in `window:${string}`]: readonly RecoverySignal[];
};

export interface RankedSignal {
  readonly signalId: RecoverySignalId;
  readonly className: string;
  readonly severity: SeverityBand;
  readonly score: number;
  readonly route: string;
}

const severityScore = (severity: SeverityBand): number => {
  if (severity === 'critical') return 1;
  if (severity === 'high') return 0.75;
  if (severity === 'medium') return 0.4;
  return 0.1;
};

const routeLabel = (tenantId: TenantId, signal: RecoverySignal): `${TenantId}/${string}` => {
  return `${tenantId}/${signal.id}`;
};

export const asRecoverySignalTuple = <TSignals extends readonly unknown[]>(signals: NoInfer<TSignals>): TSignals => {
  return [...signals] as unknown as TSignals;
};

export const parseRecoverySignals = (tenantId: TenantId, rawSignals: readonly unknown[]): ParsedSignalDigest<readonly StageSignal[]> => {
  const parsed = rawSignalBatchSchema.parse(rawSignals).map((entry) => ({
    id: createSignalId(entry.id),
    class: entry.class,
    severity: entry.severity,
    title: entry.title,
    createdAt: entry.createdAt,
    metadata: entry.metadata,
  }));
  const iterator = iteratorFrom?.(parsed)
    ? iteratorFrom(parsed).filter((signal) => Boolean(signal.id)).toArray()
    : parsed.filter((signal) => Boolean(signal.id));

  const ranked = iterator.map((signal) => {
    const stageSignal: StageSignal = {
      signal: createSignalId(`${tenantId}:${signal.id}`),
      tenantId,
      signalClass: signal.class,
      severity: signal.severity,
      score: severityScore(signal.severity),
      createdAt: Date.parse(signal.createdAt),
      source: routeLabel(tenantId, signal),
    };

    return stageSignal;
  });

  const signature = ranked.map((signal) => `${signal.signal}:${signal.severity}`).join('|');

  return {
    raw: ranked,
    signature,
  };
};

export const groupByWindow = <TSignals extends readonly StageSignal[]>(
  tenantId: TenantId,
  signals: NoInfer<TSignals>,
): SignalWindowMap => {
  const buckets = new Map<string, RecoverySignal[]>();

  for (const signal of signals) {
    const window = routeLabel(tenantId, {
      id: signal.signal,
      class: signal.signalClass,
      severity: signal.severity,
      title: signal.source,
      createdAt: new Date(signal.createdAt).toISOString(),
      metadata: { route: signal.source },
    });
    const bucket = buckets.get(window) ?? [];
    bucket.push({
      id: signal.signal,
      class: signal.signalClass,
      severity: signal.severity,
      title: signal.source,
      createdAt: new Date(signal.createdAt).toISOString(),
      metadata: { route: signal.source },
    });
    buckets.set(window, bucket);
  }

  const mapped = [...buckets.entries()].map(([window, bucket]) => [`window:${window}`, [...bucket]] as const);
  return Object.fromEntries(iteratorFrom?.(mapped) ? iteratorFrom(mapped).toArray() : mapped) as SignalWindowMap;
};

export const rankRecoverySignals = <TSignals extends readonly StageSignal[]>(
  tenantId: TenantId,
  signals: NoInfer<TSignals>,
): readonly RankedSignal[] => {
  const parsed = signals.toSorted((left, right) => right.score - left.score);
  const ranked = parsed.map((signal, index) => ({
    signalId: signal.signal,
    className: `${signal.signalClass}::${index}`,
    severity: signal.severity,
    score: Number(Math.min(1, signal.score + index * 0.001).toFixed(3)),
    route: routeLabel(tenantId, {
      id: signal.signal,
      class: signal.signalClass,
      severity: signal.severity,
      title: signal.source,
      createdAt: new Date(signal.createdAt).toISOString(),
      metadata: { signal: signal.signal },
    }),
  }));

  return iteratorFrom?.(ranked) ? iteratorFrom(ranked).toArray() : ranked;
};

export const bucketBySeverity = <TSignals extends readonly StageSignal[]>(
  signals: NoInfer<TSignals>,
): { readonly [K in SeverityBand]: ReadonlyArray<StageSignal> } => {
  const buckets = {
    critical: [] as StageSignal[],
    high: [] as StageSignal[],
    medium: [] as StageSignal[],
    low: [] as StageSignal[],
  };

  for (const signal of signals) {
    buckets[signal.severity].push(signal);
  }

  return {
    critical: [...buckets.critical],
    high: [...buckets.high],
    medium: [...buckets.medium],
    low: [...buckets.low],
  };
};

export const summarizeSignalPayload = (signals: ReadonlyArray<RecoverySignal>): SignalWindowRecord => {
  const signature = signals.map((signal) => `${signal.id}:${signal.severity}`).join('|') || 'empty';
  return {
    window: `window:${signature.length}`,
    signals,
  };
};

export const asSignalRecordMap = <TSources extends readonly RecoverySignal[]>(
  tenantId: TenantId,
  signals: NoInfer<TSources>,
): Record<string, SignalWindowRecord> => {
  const digest = parseRecoverySignals(tenantId, signals);
  const windows = groupByWindow(
    tenantId,
    digest.raw,
  );

  const entries = (Object.entries(windows) as Array<[string, RecoverySignal[]]>).map(([key, value]) => {
    const bucket = summarizeSignalPayload(value);
    return [key, bucket] as const;
  });

  return Object.fromEntries(iteratorFrom?.(entries) ? iteratorFrom(entries).toArray() : entries);
};
