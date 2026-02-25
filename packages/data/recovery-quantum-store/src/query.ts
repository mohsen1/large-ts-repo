import type { QuantumQueryFilter, QuantumRunRecord } from './models';
import type { QuantumSeverity, QuantumTenantId } from '@domain/recovery-quantum-orchestration';

export type QueryOperator = 'eq' | 'in' | 'gte' | 'lte';

export interface Constraint<TPath extends string, TValue> {
  readonly path: TPath;
  readonly operator: QueryOperator;
  readonly value: TValue;
}

export type ConstraintTuple<
  TFilter extends readonly string[],
  TOutput extends readonly Constraint<string, unknown>[] = [],
> = TFilter extends readonly [infer H extends string, ...infer Rest extends readonly string[]]
  ? ConstraintTuple<Rest, [...TOutput, Constraint<H, unknown>]>
  : TOutput;

export interface QuantumRunQuery {
  readonly tenant?: QuantumTenantId;
  readonly severity?: QuantumSeverity;
  readonly from?: string;
  readonly to?: string;
  readonly includeIdle?: boolean;
}

export interface QueryResult<T> {
  readonly data: readonly T[];
  readonly total: number;
  readonly filtered: number;
  readonly query: QuantumRunQuery;
}

const compareDate = (value: string, from?: string, to?: string): boolean => {
  if (!from && !to) {
    return true;
  }
  if (from && value < from) {
    return false;
  }
  if (to && value > to) {
    return false;
  }
  return true;
};

export const applyRunFilters = (runs: readonly QuantumRunRecord[], query: QuantumRunQuery): QueryResult<QuantumRunRecord> => {
  const severity = new Set(query.severity ? [query.severity] : []);
  const visible = runs.filter((run) => {
    if (query.tenant && run.tenant !== query.tenant) {
      return false;
    }
    if (severity.size > 0 && !run.signals.some((signal) => severity.has(signal.severity))) {
      return false;
    }
    if (!compareDate(run.metadata.updatedAt, query.from, query.to)) {
      return false;
    }
    if (!query.includeIdle && run.signals.length === 0) {
      return false;
    }
    return true;
  });
  return {
    data: visible,
    total: runs.length,
    filtered: visible.length,
    query,
  };
};

export const summarizeFilters = (filters: readonly QuantumQueryFilter[]): string =>
  filters
    .map((filter) => {
      const entries = Object.entries(filter);
      return entries
        .map(([name, value]) => `${name}=${String(value)}`)
        .filter((item) => item.length > 0)
        .join(',');
    })
    .filter((item) => item.length > 0)
    .join(' || ');

export const buildFilterGraph = <T extends readonly QuantumQueryFilter[]>(
  ...filters: T
): { readonly constraints: ConstraintTuple<readonly ['tenant', 'severity', 'fromIso', 'toIso']>; readonly filters: T } => ({
  constraints: [
    {
      path: 'tenant',
      operator: 'eq',
      value: filters[0]?.tenant ?? 'global',
    },
    {
      path: 'severity',
      operator: 'eq',
      value: filters[0]?.severity ?? 'info',
    },
    {
      path: 'fromIso',
      operator: 'gte',
      value: filters[0]?.fromIso ?? '1970-01-01T00:00:00.000Z',
    },
    {
      path: 'toIso',
      operator: 'lte',
      value: filters[0]?.toIso ?? new Date().toISOString(),
    },
  ],
  filters,
});
