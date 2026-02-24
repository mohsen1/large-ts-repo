import { RecursivePath } from '@shared/type-level';
import { PolicyStoreArtifact, PolicyStoreFilters, PolicyStoreRecordMeta, PolicyStoreRunRecord, PolicyStoreSort } from './types';
import { InMemoryPolicyStore } from './store';

export type QueryOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'has' | 'in';

export interface QueryClause<TModel extends PolicyStoreRecordMeta = PolicyStoreRecordMeta> {
  readonly path: Extract<RecursivePath<TModel>, string>;
  readonly op: QueryOperator;
  readonly value: readonly (string | number | boolean)[] | string | number | boolean;
}

export interface QueryWindow<TModel extends PolicyStoreRecordMeta = PolicyStoreRecordMeta> {
  readonly values: readonly TModel[];
  readonly cursor: string;
  readonly hasMore: boolean;
}

export type ClauseFilter<TModel extends PolicyStoreRecordMeta = PolicyStoreRecordMeta> = QueryClause<TModel>;

export interface QueryRequest<TModel extends PolicyStoreRecordMeta = PolicyStoreRecordMeta> {
  readonly clauses: readonly ClauseFilter<TModel>[];
  readonly limit?: number;
  readonly cursor?: string;
}

type ClausePath<TModel extends PolicyStoreRecordMeta> = QueryClause<TModel>['path'];
type ClauseValue = QueryClause['value'];

type ClauseMatrix<T extends readonly ClauseFilter[]> = {
  [K in keyof T as `clause:${Extract<K, string>}`]: T[K];
};

const asNumber = (value: string | number | boolean): number =>
  typeof value === 'number' ? value : Number(value === true ? 1 : 0);

const readPath = <TModel extends PolicyStoreRecordMeta>(record: TModel, path: ClausePath<TModel>): unknown =>
  (record as Record<string, unknown>)[path];

const compare = (left: unknown, right: ClauseValue, op: QueryOperator): boolean => {
  if (op === 'in') {
    return Array.isArray(right) && right.includes(left as never);
  }

  const normalizedRight = asNumber(right as string | number | boolean);
  const normalizedLeft = asNumber(left as string | number | boolean);
  switch (op) {
    case 'eq':
      return left === right;
    case 'ne':
      return left !== right;
    case 'gt':
      return normalizedLeft > normalizedRight;
    case 'gte':
      return normalizedLeft >= normalizedRight;
    case 'lt':
      return normalizedLeft < normalizedRight;
    case 'lte':
      return normalizedLeft <= normalizedRight;
    case 'has':
      return String(left).includes(String(right));
    default:
      return false;
  }
};

export const filterByClauses = <TModel extends PolicyStoreRecordMeta>(
  records: readonly TModel[],
  clauses: readonly ClauseFilter<TModel>[],
): readonly TModel[] =>
  records.filter((record) =>
    clauses.every((clause) => compare(readPath(record, clause.path), clause.value, clause.op)),
  );

export const executeQueryWindow = <TModel extends PolicyStoreRecordMeta>(
  records: readonly TModel[],
  request: QueryRequest<TModel>,
): QueryWindow<TModel> => {
  const limit = request.limit ?? records.length;
  const values = filterByClauses(records, request.clauses).slice(0, limit);
  return {
    values,
    cursor: request.cursor ?? '',
    hasMore: filterByClauses(records, request.clauses).length > limit,
  };
};

export const collectArtifactsByWindow = async (
  store: InMemoryPolicyStore,
  filters: PolicyStoreFilters,
  sort: PolicyStoreSort,
  query: {
    readonly clauses: readonly ClauseFilter<PolicyStoreArtifact>[];
    readonly limit: number;
    readonly cursor: string;
  },
): Promise<QueryWindow<PolicyStoreArtifact>> => {
  const records = await store.searchArtifacts(filters, sort);
  return executeQueryWindow(records, query);
};

export const collectRunsByWindow = async (
  store: InMemoryPolicyStore,
  orchestratorId: string,
  query: {
    readonly clauses: readonly ClauseFilter<PolicyStoreRunRecord>[];
    readonly limit: number;
    readonly cursor: string;
  },
): Promise<QueryWindow<PolicyStoreRunRecord>> => {
  const records = await store.searchRuns(orchestratorId);
  return executeQueryWindow(records, query);
};

export const toClauseMatrix = <T extends readonly ClauseFilter[]>(
  clauses: T,
): ClauseMatrix<T> =>
  Object.fromEntries(
    clauses.map((clause, index) => [`clause:${index}` as const, clause]),
  ) as ClauseMatrix<T>;
