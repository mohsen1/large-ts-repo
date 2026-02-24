import type { JsonLike, ValidationResult, HorizonSignal, PluginStage, TimeMs } from '@domain/recovery-horizon-engine';
import { parseHorizonSignal } from '@domain/recovery-horizon-engine';
import { err, ok, type Result } from '@shared/result';
import type { JsonValue, NoInfer, NonEmptyArray } from '@shared/type-level';
import type { HorizonLookupConfig, HorizonReadResult, HorizonStoreRecord } from './types.js';

type QuerySignal = HorizonSignal<PluginStage, JsonLike>;

export type SignalPath =
  | 'id'
  | 'kind'
  | 'severity'
  | 'startedAt'
  | 'expiresAt'
  | 'input'
  | `input.${string}`
  | 'payload'
  | `payload.${string}`
  | 'metadata'
  | `metadata.${string}`;

type StageTotals = { [K in PluginStage]: number };

export type ClauseKind = 'equals' | 'prefix' | 'in' | 'between';

export type QueryClause<TRecord extends QuerySignal = QuerySignal> =
  | {
      readonly kind: 'equals';
      readonly field: SignalPath;
      readonly expected: JsonValue;
    }
  | {
      readonly kind: 'prefix';
      readonly field: SignalPath;
      readonly expected: string;
    }
  | {
      readonly kind: 'in';
      readonly field: SignalPath;
      readonly expected: readonly JsonValue[];
    }
  | {
      readonly kind: 'between';
      readonly field: SignalPath;
      readonly min: number;
      readonly max: number;
    };

export type QueryShape<TRecord extends QuerySignal = QuerySignal> = {
  readonly must: NoInfer<NonEmptyArray<QueryClause<TRecord>>>;
  readonly orderBy?: SignalPath;
  readonly order?: 'asc' | 'desc';
  readonly pageSize?: number;
};

type QueryPage<TRows extends readonly HorizonStoreRecord[] = readonly HorizonStoreRecord[]> = {
  readonly index: number;
  readonly rows: TRows;
  readonly cursor?: string;
};

type StageCountMap = {
  [K in PluginStage]: number;
};

const asRecord = (value: unknown): Record<string, JsonValue> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, JsonValue>;
  }
  return {};
};

const parsePath = (value: string | undefined, fallback: string): string[] =>
  (value ?? fallback).split('.').filter(Boolean);

const readFromObject = (source: Record<string, JsonValue>, path: string): JsonValue => {
  const segments = parsePath(path, '');
  let current: JsonValue = source;
  for (const segment of segments) {
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      current = asRecord(current)[segment];
      continue;
    }
    return null;
  }
  return current;
};

const fieldValue = (signal: QuerySignal, field: SignalPath): JsonValue => {
  if (field === 'id' || field === 'kind' || field === 'severity' || field === 'startedAt' || field === 'expiresAt') {
    return signal[field] as JsonValue;
  }

  if (field === 'input') {
    return asRecord(signal.input);
  }

  if (field === 'payload') {
    return asRecord(signal.payload);
  }

  if (field === 'metadata') {
    return asRecord(signal.input.metadata);
  }

  if (field.startsWith('input.')) {
    return readFromObject(asRecord(signal.input), field.slice(6));
  }

  if (field.startsWith('payload.')) {
    return readFromObject(asRecord(signal.payload), field.slice(8));
  }

  if (field.startsWith('metadata.')) {
    return readFromObject(asRecord(signal.input.metadata), field.slice(9));
  }

  return null;
};

const equalsClause = (clause: Extract<QueryClause, { kind: 'equals' }>, signal: QuerySignal): boolean =>
  fieldValue(signal, clause.field) === clause.expected;

const prefixClause = (clause: Extract<QueryClause, { kind: 'prefix' }>, signal: QuerySignal): boolean => {
  const value = fieldValue(signal, clause.field);
  return typeof value === 'string' && value.startsWith(clause.expected);
};

const inClause = (clause: Extract<QueryClause, { kind: 'in' }>, signal: QuerySignal): boolean => {
  const value = fieldValue(signal, clause.field);
  return clause.expected.includes(value);
};

const numericValue = (value: JsonValue): number => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const betweenClause = (clause: Extract<QueryClause, { kind: 'between' }>, signal: QuerySignal): boolean => {
  const value = fieldValue(signal, clause.field);
  if (typeof value !== 'number') {
    return false;
  }
  const numeric = numericValue(value);
  return numeric >= clause.min && numeric <= clause.max;
};

const matchesClause = (signal: QuerySignal, clause: QueryClause<QuerySignal>): boolean =>
  clause.kind === 'equals'
    ? equalsClause(clause, signal)
    : clause.kind === 'prefix'
      ? prefixClause(clause, signal)
      : clause.kind === 'in'
        ? inClause(clause, signal)
        : betweenClause(clause, signal);

export const buildSignalSelector = <TRecord extends QuerySignal>(
  signal: TRecord,
  field: SignalPath,
  expected: JsonValue,
): QueryClause<TRecord> => ({
  kind: 'equals',
  field,
  expected,
} as QueryClause<TRecord>);

export const runQuery = (
  rows: readonly HorizonStoreRecord[],
  clauses: readonly QueryClause<QuerySignal>[],
): readonly HorizonStoreRecord[] =>
  clauses.length === 0
    ? rows
    : rows.filter((entry) => {
      const signal = parseHorizonSignal(entry.signal);
      return clauses.every((clause) => matchesClause(signal as QuerySignal, clause));
    });

const resolveNumeric = (rows: readonly HorizonStoreRecord[], path: SignalPath): number[] =>
  rows.map((entry) => numericValue(fieldValue(entry.signal, path)));

export const rankRows = (
  rows: readonly HorizonStoreRecord[],
  orderBy: SignalPath = 'startedAt',
  order: 'asc' | 'desc' = 'desc',
): readonly HorizonStoreRecord[] => {
  const values = resolveNumeric(rows, orderBy);
  const ordered = [...rows].map((entry, index) => ({ entry, value: values[index] ?? 0 })).sort((left, right) =>
    order === 'asc' ? left.value - right.value : right.value - left.value,
  );
  return ordered.map((entry) => entry.entry);
};

export const resolvePage = (
  rows: readonly HorizonStoreRecord[],
  pageSize = 100,
): readonly QueryPage[] => {
  const total = Math.max(1, rows.length === 0 ? 0 : Math.ceil(rows.length / Math.max(1, pageSize)));
  const sized = total === 0 ? 0 : total;
  return [...Array(sized).keys()].map((index) => {
    const start = index * pageSize;
    const chunk = rows.slice(start, start + pageSize);
    const at = chunk.at(-1)?.id;
    return {
      index,
      rows: chunk as QueryPage['rows'],
      cursor: chunk.length ? `cursor:${index}:${at}` : undefined,
    };
  });
};

const normalizeShape = (shape: QueryShape): {
  readonly orderBy: SignalPath;
  readonly order: 'asc' | 'desc';
  readonly pageSize: number;
} => ({
  orderBy: shape.orderBy ?? 'startedAt',
  order: shape.order ?? 'desc',
  pageSize: shape.pageSize ?? 80,
});

export const evaluateQuery = (
  rows: readonly HorizonStoreRecord[],
  shape: QueryShape<QuerySignal>,
): ValidationResult<HorizonReadResult> => {
  const normalized = normalizeShape(shape);
  const filtered = runQuery(rows, shape.must);
  if (!filtered.length) {
    return {
      ok: false,
      errors: [
        {
          path: ['query', 'must'],
          message: `no results for ${shape.must.length} clauses`,
          severity: 'warn',
        },
      ],
    };
  }

  const ordered = rankRows(filtered, normalized.orderBy, normalized.order);
  const pages = resolvePage(ordered, normalized.pageSize);
  const items = pages.flatMap((entry) => entry.rows);
  return {
    ok: true,
    value: {
      items,
      total: items.length,
      cursor: pages[0]?.cursor,
    },
  };
};

export interface QuerySeries<T extends readonly QuerySignal[]> {
  readonly records: T;
  readonly stats: {
    readonly totals: StageTotals;
    readonly severity: {
      readonly low: number;
      readonly medium: number;
      readonly high: number;
      readonly critical: number;
    };
    readonly latestAt: TimeMs;
    readonly oldestAt: TimeMs;
  };
}

type SignalKey = PluginStage;

const countBy = (
  input: readonly QueryClause<QuerySignal>[],
  key: SignalKey,
): number =>
  input.reduce(
    (count, clause) =>
      clause.kind === 'equals' && clause.field === 'kind' && clause.expected === key ? count + 1 : count,
    0,
  );

export const analyzeSignals = <T extends readonly QuerySignal[]>(
  signals: T,
): QuerySeries<T> => {
  const totals: StageTotals = {
    ingest: 0,
    analyze: 0,
    resolve: 0,
    optimize: 0,
    execute: 0,
  };
  const severity = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  for (const signal of signals) {
    totals[signal.kind] += 1;
    severity[signal.severity] += 1;
  }

  const latest = [...signals].sort((left, right) =>
    Number(new Date(right.startedAt)) - Number(new Date(left.startedAt)),
  );
  const toTimeMs = (value: string): TimeMs => {
    const parsed = Date.parse(value);
    return (Number.isFinite(parsed) ? parsed : 0) as TimeMs;
  };

  return {
    records: signals,
    stats: {
      totals,
      severity,
      latestAt: latest[0] ? toTimeMs(latest[0].startedAt) : 0 as TimeMs,
      oldestAt: latest.at(-1) ? toTimeMs(latest.at(-1)!.startedAt) : 0 as TimeMs,
    },
  };
};

export const toReadResult = (signals: readonly HorizonStoreRecord[]): Result<HorizonReadResult> => {
  if (!signals.length) {
    return err(new Error('empty read result'));
  }
  return ok({
    items: signals,
    total: signals.length,
    cursor: `cursor:${signals.length}`,
  });
};

export const fromLookupConfig = (config: HorizonLookupConfig): QueryShape<QuerySignal> => {
  const base = ['ingest', 'analyze', 'resolve', 'optimize', 'execute'] as const;
  const stages = config.stages?.length
    ? config.stages
    : base;

  const tenantClause: QueryClause<QuerySignal> = {
    kind: 'equals',
    field: 'input.tenantId',
    expected: config.tenantId,
  };

  const stageClauses = stages.map((stage) => ({
    kind: 'equals' as const,
    field: 'kind' as const,
    expected: stage,
  }));

  const sinceClause = config.maxRows === undefined
    ? []
    : [{
      kind: 'between' as const,
      field: 'startedAt' as const,
      min: 0,
      max: config.maxRows,
    }];

  const must = (stageClauses.length || sinceClause.length
    ? [tenantClause, ...stageClauses, ...sinceClause]
    : [tenantClause]) as NonEmptyArray<QueryClause<QuerySignal>>;

  return {
    must,
    orderBy: 'startedAt' as const,
    order: 'desc' as const,
    pageSize: config.maxRows,
  };
};

export const describeQuery = (shape: QueryShape<QuerySignal>) => ({
  totalClauses: shape.must.length,
  orderBy: shape.orderBy ?? 'startedAt',
  order: shape.order ?? 'desc',
  pageSize: shape.pageSize ?? 80,
  stage: countBy(shape.must, 'ingest'),
}) satisfies Readonly<Record<string, string | number>>;
