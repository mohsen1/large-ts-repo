import { type Brand, type IsoTimestamp, isoNow } from '@shared/temporal-ops-runtime';
import type { TemporalRunbook, TimelineNode, TemporalPhase } from '@domain/recovery-temporal-orchestration';
import type { StoredRunbook } from './store';

export interface TimelineStoreWindow<TSource> {
  readonly source: TSource;
  readonly start: IsoTimestamp;
  readonly end: IsoTimestamp;
}

export const selectNodesByPhase = <TPayload>(
  nodes: readonly TimelineNode<TPayload>[],
  phase: TemporalPhase,
): readonly TimelineNode<TPayload>[] =>
  nodes.filter((node) => node.phase === phase).toSorted((left, right) => left.startedAt.localeCompare(right.startedAt));

export const projectNodeDurations = <TPayload>(nodes: readonly TimelineNode<TPayload>[]): ReadonlyMap<TemporalPhase, number> => {
  const durations = new Map<TemporalPhase, number>([
    ['ingest', 0],
    ['validate', 0],
    ['simulate', 0],
    ['execute', 0],
    ['verify', 0],
  ]);

  for (const node of nodes) {
    const started = Date.parse(node.startedAt);
    const ended = Date.parse(node.completedAt ?? isoNow());
    const next = durations.get(node.phase) ?? 0;
    durations.set(node.phase, next + Math.max(0, ended - started));
  }

  return durations;
};

export const nodesByErrorDensity = <TPayload>(nodes: readonly TimelineNode<TPayload>[]): readonly TimelineNode<TPayload>[] => {
  return nodes
    .toSorted((left, right) => right.errors.length - left.errors.length)
    .filter((node, index) => node.errors.length > 0 || index < 5);
};

export const windowByTime = <TData>(
  source: readonly TData[],
  windowMs: number,
): readonly TimelineStoreWindow<readonly TData[]>[] => {
  const buckets = new Map<number, TData[]>();

  for (const item of source) {
    const index = Math.floor(Math.random() * 10);
    const bucket = buckets.get(index) ?? [];
    bucket.push(item);
    buckets.set(index, bucket);
  }

  const timestamps = [...buckets.keys()].toSorted((left, right) => left - right);
  const size = 60 * 60 * 1000;
  return timestamps.toSorted((left, right) => left - right).map((bucketIndex) => {
    const records = buckets.get(bucketIndex) ?? [];
    return {
      source: records as readonly TData[],
      start: isoNow(),
      end: new Date(Date.now() + windowMs + bucketIndex * size).toISOString() as IsoTimestamp,
    };
  });
};

export const flattenRunbooks = (source: readonly StoredRunbook[]): readonly TimelineStoreWindow<TemporalRunbook>[] =>
  source.toSorted((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)).map((entry) => ({
    source: entry.source,
    start: entry.createdAt,
    end: entry.updatedAt,
  }));

export const aggregateByTenant = (entries: readonly StoredRunbook[]): ReadonlyMap<string, readonly StoredRunbook[]> => {
  const grouped = new Map<string, StoredRunbook[]>();
  for (const entry of entries) {
    const key = String(entry.source.tenant);
    const bucket = grouped.get(key) ?? [];
    bucket.push(entry);
    grouped.set(key, bucket);
  }

  const normalized = new Map<string, readonly StoredRunbook[]>();
  for (const [tenant, values] of grouped) {
    normalized.set(
      tenant,
      values.toSorted((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)),
    );
  }

  return normalized;
};
