import {
  createIntentStepId,
  type IncidentIntentRecord,
  type IncidentIntentSignal,
  type IncidentIntentPolicy,
} from '@domain/recovery-incident-intent';
import { type IncidentIntentRoute, type IntentNodeId } from '@domain/recovery-incident-intent';
import type { StoredIntentRecord } from './models';

export interface CursorRange {
  readonly before?: string;
  readonly after?: string;
  readonly limit: number;
}

export interface WorkspaceQuery {
  readonly tenantId: string;
  readonly include: Readonly<Record<'nodes' | 'edges' | 'signals', boolean>>;
  readonly cursor?: CursorRange;
}

type FilterByTitle<T> = T extends { readonly title: infer TTitle }
  ? TTitle extends string
    ? (title: string) => boolean
    : never
  : never;

export const makeFilterByTitle = (query: string): FilterByTitle<IncidentIntentRecord> => {
  const lower = query.trim().toLowerCase();
  return (title) => title.toLowerCase().includes(lower);
};

export const scoreRecord = (
  record: StoredIntentRecord,
  query: WorkspaceQuery,
): number => {
  const includeNodes = query.include.nodes ? record.manifest.nodes.length : 0;
  const includeEdges = query.include.edges ? record.manifest.edges.length : 0;
  const includeSignals = query.include.signals ? (record.manifest.route?.steps.length ?? 0) : 0;
  const hasWindow = query.cursor?.after || query.cursor?.before ? 4 : 2;
  return includeNodes + includeEdges + includeSignals + hasWindow;
};

export const applyCursor = <T extends readonly StoredIntentRecord[]>(
  records: T,
  cursor?: CursorRange,
): T => {
  if (!cursor) return records;

  const ordered = [...records].toSorted((left, right) => right.createdAt.localeCompare(left.createdAt));
  const limit = Math.max(1, cursor.limit);
  const start = typeof cursor.after === 'string'
    ? ordered.findIndex((record) => record.createdAt < cursor.after!)
    : 0;
  const end = typeof cursor.before === 'string'
    ? ordered.findIndex((record) => record.createdAt < cursor.before!)
    : ordered.length;

  const normalizedStart = Math.max(0, start);
  const normalizedEnd = end === -1 ? ordered.length : Math.min(end, ordered.length);

  return ordered.slice(normalizedStart, normalizedEnd).slice(0, limit) as unknown as T;
};

export const queryWorkspace = (
  records: readonly StoredIntentRecord[],
  query: WorkspaceQuery,
): readonly StoredIntentRecord[] => {
  const byTenant = records.filter((record) => record.tenantId === query.tenantId);
  const filter = makeFilterByTitle('');
  const scored = byTenant.map((record) => ({
    record,
    score: scoreRecord(record, query),
  }));
  const sorted = scored.toSorted((left, right) => right.score - left.score);
  const listed = sorted.map((entry) => entry.record);
  const filtered = listed.filter((record) => query.cursor ? filter(record.manifest.title) : true);
  return applyCursor(filtered, query.cursor);
};

export const projectTuple = <
  T extends readonly StoredIntentRecord[],
  TIncludeSignals extends boolean,
>(
  records: T,
  includeSignals: TIncludeSignals,
): TIncludeSignals extends true ? readonly IncidentIntentRecord[] : readonly Omit<IncidentIntentRecord, 'route'>[] => {
  const projected = records.map((record) => {
    if (includeSignals) {
      const route = record.manifest.route;
      return {
        ...record.manifest,
        route,
      } as IncidentIntentRecord;
    }
    const { route: _route, ...rest } = record.manifest;
    return rest as Omit<IncidentIntentRecord, 'route'>;
  });

  return projected as unknown as TIncludeSignals extends true
    ? readonly IncidentIntentRecord[]
    : readonly Omit<IncidentIntentRecord, 'route'>[];
};

export const collectSignalCounts = <T extends readonly StoredIntentRecord[]>(records: T): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const record of records) {
    const routeLength = record.manifest.route?.steps.length ?? 0;
    const key = `${record.manifest.tenantId}:${routeLength}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
};

export const toSignalTupleDemo = <T extends readonly string[]>(
  tuple: T,
): IncidentIntentRoute['steps'] => {
  const stepInputTuple = tuple.map((signal, index) => ({
    id: `${signal}-${index}`,
    kind: 'telemetry' as const,
    source: 'demo',
    value: index,
    unit: 'ratio',
    observedAt: new Date(Date.now() + index).toISOString(),
    labels: { mode: 'tuple-demo' },
  }));

  return stepInputTuple.map((signal, index) => ({
    stepId: createIntentStepId(signal.id, index),
    path: `${index}:${signal.id}`,
    weight: signal.value + 1,
    latencyMs: signal.value,
    labels: signal.labels,
  }));
};

export const routeSignals = <TSignals extends readonly IncidentIntentSignal[]>(
  signals: TSignals,
): IncidentIntentSignal[] => [...signals].toSorted((left, right) => left.id.localeCompare(right.id));

export interface RouteShape {
  readonly nodes: readonly IntentNodeId[];
  readonly labels: Readonly<Record<string, string>>;
}
