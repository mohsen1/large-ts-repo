import { Query, QueryResult, QueryStats, Engine, inferFilter, order, project, paginate } from './query';

interface Table<T> {
  name: string;
  rows: readonly T[];
}

export class MemoryWarehouse implements Engine {
  private readonly tables = new Map<string, readonly unknown[]>();

  register<T>(name: string, rows: readonly T[]): void {
    this.tables.set(name, rows);
  }

  async execute<T>(query: Query<T>): Promise<QueryResult<T>> {
    const start = Date.now();
    const source = (this.tables.get(query.from) ?? []) as readonly T[];
    const filtered = source.filter((row) => inferFilter(query, row));
    const sorted = order(query, filtered);
    const projected = project(query, sorted);
    const paginated = paginate(query, projected as readonly T[]);
    const elapsed = Date.now() - start;
    return {
      rows: paginated as readonly T[],
      stats: {
        scannedRows: source.length,
        matchedRows: filtered.length,
        elapsedMs: elapsed,
      },
    };
  }
}

export function explain<T>(query: Query<T>): string {
  const filters = query.where.map((w) => `${String(w.field)}${w.op}${String(w.value)}`).join(' AND ');
  const sorts = query.sort.map((s) => `${String(s.field)} ${s.asc ? 'asc' : 'desc'}`).join(',');
  return `SELECT ${query.projection?.fields?.join(',') ?? '*'} FROM ${query.from} WHERE ${filters} ORDER BY ${sorts} LIMIT ${query.limit} OFFSET ${query.offset}`;
}

export function optimize<T>(query: Query<T>): Query<T> {
  return {
    ...query,
    where: [...query.where].sort((a, b) => String(a.field).localeCompare(String(b.field))),
    sort: [...query.sort],
  };
}
