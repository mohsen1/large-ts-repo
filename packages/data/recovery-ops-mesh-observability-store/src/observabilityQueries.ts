import { withBrand } from '@shared/core';
import { NoInfer } from '@shared/type-level';
import type { Result } from '@shared/result';
import {
  isAlertRecord,
  isObservationRecord,
  parseObservation,
  type ObservabilityEventRecord,
  type RecordCursor,
} from './types';
import { type MeshSignalKind } from '@domain/recovery-ops-mesh';
import type { MeshPlanId } from '@domain/recovery-ops-mesh';

export interface ObservabilityReportQuery {
  readonly namespace: string;
  readonly kinds: readonly MeshSignalKind[];
  readonly maxItems: number;
}

export interface QueryWindow<TSignals extends readonly MeshSignalKind[]> {
  readonly planId: MeshPlanId;
  readonly maxItems: number;
  readonly allowedKinds: TSignals;
  readonly includeAlerts: boolean;
}

export interface QueryResult<TSignals extends readonly MeshSignalKind[]> {
  readonly query: QueryWindow<TSignals>;
  readonly matched: readonly ObservabilityEventRecord[];
  readonly bySignal: { [K in TSignals[number]]: readonly ObservabilityEventRecord[] };
  readonly cursor?: RecordCursor;
}

type EventRecordPredicate = (event: ObservabilityEventRecord) => boolean;
type SignalBucketAccumulator<TSignals extends readonly MeshSignalKind[]> = {
  [K in TSignals[number]]: ObservabilityEventRecord[];
};

const emptyBucket = <TSignals extends readonly MeshSignalKind[]>(
  signals: TSignals,
): SignalBucketAccumulator<TSignals> => {
  const acc = {} as { [K in TSignals[number]]: ObservabilityEventRecord[] };
  for (const kind of signals) {
    acc[kind as TSignals[number]] = [];
  }
  return acc as SignalBucketAccumulator<TSignals>;
};

const isAllowedKind = <TSignals extends readonly MeshSignalKind[]>(
  kinds: TSignals,
  kind: MeshSignalKind,
): kind is TSignals[number] => kinds.includes(kind as never);

const toSignalKind = <TSignals extends readonly MeshSignalKind[]>(
  event: ObservabilityEventRecord,
  kinds: TSignals,
): TSignals[number] | undefined => {
  if (!isObservationRecord(event)) {
    return undefined;
  }
  return isAllowedKind(kinds, event.signal.kind) ? event.signal.kind : undefined;
};

export const createQueryWindow = <const TSignals extends readonly MeshSignalKind[]> (
  planId: MeshPlanId,
  signalKinds: TSignals,
  maxItems = 64,
): QueryWindow<TSignals> => ({
  planId,
  maxItems,
  allowedKinds: signalKinds,
  includeAlerts: true,
});

export const filterSignals = <TSignals extends readonly MeshSignalKind[]>(
  events: readonly ObservabilityEventRecord[],
  query: QueryWindow<TSignals>,
): QueryResult<TSignals> => {
  const matched = events.filter((event) => {
    const kind = toSignalKind(event, query.allowedKinds);
    return kind !== undefined || (query.includeAlerts && isAlertRecord(event));
  });

  const sorted = matched.toSorted((left, right) => {
    const leftAt = isObservationRecord(left) ? left.at : left.emittedAt;
    const rightAt = isObservationRecord(right) ? right.at : right.emittedAt;
    return rightAt - leftAt;
  });

  const bySignal = {} as Record<MeshSignalKind, readonly ObservabilityEventRecord[]>;
  for (const event of sorted.slice(0, query.maxItems)) {
    const kind = toSignalKind(event, query.allowedKinds);
    if (kind) {
      bySignal[kind] = [...(bySignal[kind] ?? []), event];
    }
  }

  return {
    query,
    matched: sorted.slice(0, query.maxItems),
    bySignal: bySignal as QueryResult<TSignals>['bySignal'],
  };
};

export const queryWithCursor = <TSignals extends readonly MeshSignalKind[]>(
  events: readonly ObservabilityEventRecord[],
  query: QueryWindow<TSignals>,
  cursor?: RecordCursor,
): QueryResult<TSignals> => {
  const filtered = filterSignals(events, query);
  return {
    ...filtered,
    cursor: {
      token: withBrand(`${query.planId}:${cursor?.token ?? Date.now()}`, 'obs-store-cursor'),
      records: filtered.matched,
      hasMore: filtered.matched.length >= query.maxItems,
    },
  };
};

export const collectWorkspaceHistory = async <TSignals extends readonly MeshSignalKind[]>(
  query: QueryWindow<TSignals>,
  recordsFetcher: () => Promise<readonly ObservabilityEventRecord[]>,
  filter: EventRecordPredicate = () => true,
): Promise<QueryResult<TSignals>> => {
  const records = await recordsFetcher();
  const filtered = records.filter((event) => filter(event));
  return queryWithCursor(filtered, query);
};

export const summarizeAlerts = (events: readonly ObservabilityEventRecord[]) => {
  const alerts = events.filter(isAlertRecord);
  const trace = alerts.map((entry) => `alert:${entry.alert}:${entry.emittedAt}`).toSorted();
  return {
    trace,
    alerts,
  };
};

export const collectObservabilityEvents = async <TSignals extends readonly MeshSignalKind[]>(
  query: QueryWindow<TSignals>,
  fetcher: (planId: MeshPlanId) => Promise<ObservabilityEventRecord[]>,
): Promise<QueryResult<TSignals>> => {
  const events = await fetcher(query.planId);
  const parsed = events.map((entry) => (isObservationRecord(entry) ? parseObservation(entry) : entry));
  return filterSignals(parsed, query);
};

export const collectSignalsByPlan = async <TSignals extends readonly MeshSignalKind[]>(
  query: QueryWindow<TSignals>,
  recordsFetcher: () => Promise<ObservabilityEventRecord[]>,
): Promise<QueryResult<TSignals>> => {
  const raw = await recordsFetcher();
  return filterSignals(raw, query);
};

export const buildObservabilityReportQuery = <TSignals extends readonly MeshSignalKind[]>(signals: NoInfer<TSignals>) =>
  ({
    namespace: 'studio',
    kinds: [...signals],
    maxItems: 50,
  }) as ObservabilityReportQuery;

export const collectSignalsResult = async <TSignals extends readonly MeshSignalKind[]>(
  query: QueryWindow<TSignals>,
  fetcher: (planId: MeshPlanId) => Promise<Result<readonly ObservabilityEventRecord[], Error>>,
): Promise<QueryResult<TSignals>> => {
  const records = await fetcher(query.planId);
  return filterSignals(records.ok ? records.value : [], query);
};
