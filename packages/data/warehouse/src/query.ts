export interface Predicate<T> {
  field: keyof T & string;
  op: 'eq' | 'neq' | 'gt' | 'lt' | 'in' | 'contains';
  value: unknown;
}

export interface SortSpec<T> {
  field: keyof T & string;
  asc: boolean;
}

export interface Projection<T> {
  fields?: Array<keyof T & string>;
  includeMeta?: boolean;
}

export interface Query<T> {
  from: string;
  where: readonly Predicate<T>[];
  sort: readonly SortSpec<T>[];
  projection?: Projection<T>;
  limit: number;
  offset: number;
}

export interface DataSourceRef {
  name: string;
  schema: Record<string, string>;
  primary: string;
}

export interface QueryStats {
  scannedRows: number;
  matchedRows: number;
  elapsedMs: number;
}

export interface QueryResult<T> {
  rows: readonly T[];
  stats: QueryStats;
}

export interface Engine {
  execute<T>(query: Query<T>): Promise<QueryResult<T>>;
}

export function inferFilter<T>(query: Query<T>, row: T): boolean {
  for (const where of query.where) {
    const value = row[where.field as keyof T];
    switch (where.op) {
      case 'eq':
        if (value !== where.value) return false;
        break;
      case 'neq':
        if (value === where.value) return false;
        break;
      case 'gt':
        if (typeof value !== 'number' || !(value > Number(where.value))) return false;
        break;
      case 'lt':
        if (typeof value !== 'number' || !(value < Number(where.value))) return false;
        break;
      case 'contains':
        if (!String(value).includes(String(where.value))) return false;
        break;
      case 'in':
        if (!Array.isArray(where.value) || !where.value.includes(value)) return false;
        break;
      default:
        return false;
    }
  }
  return true;
}

export function project<T>(query: Query<T>, rows: readonly T[]): readonly Partial<T>[] {
  const fields = query.projection?.fields;
  if (!fields || fields.length === 0) return rows;
  return rows.map((row: T) => {
    const out: Partial<T> = {};
    for (const f of fields) {
      out[f] = row[f];
    }
    return out;
  });
}

export function order<T>(query: Query<T>, rows: readonly T[]): readonly T[] {
  if (query.sort.length === 0) return rows;
  return [...rows].sort((a, b) => {
    for (const s of query.sort) {
      const av = a[s.field as keyof T] as unknown;
      const bv = b[s.field as keyof T] as unknown;
      if (av === bv) continue;
      if (av == null) return s.asc ? -1 : 1;
      if (bv == null) return s.asc ? 1 : -1;
      if (av > bv) return s.asc ? 1 : -1;
      if (av < bv) return s.asc ? -1 : 1;
    }
    return 0;
  });
}

export function paginate<T>(query: Query<T>, rows: readonly T[]): readonly T[] {
  const start = Math.max(query.offset, 0);
  const end = start + Math.max(query.limit, 0);
  return rows.slice(start, end);
}
