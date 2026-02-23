import { Repository } from './interfaces';

export type MatchPredicate<TEntity> = (value: TEntity) => boolean;

export interface CursorWindow<TEntity> {
  readonly items: readonly TEntity[];
  readonly nextCursor?: string;
}

export const defaultPageSize = 40;

const normalizeLimit = (limit?: number): number => {
  if (!limit || limit <= 0) return defaultPageSize;
  return Math.min(limit, 500);
};

export const buildCursor = (index: number): string => `cursor-${String(index).padStart(4, '0')}`;

export const parseCursor = (value?: string): number => {
  if (!value) return 0;
  const [, raw] = value.split('-', 2);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

export const listByCursor = <TEntity, TFilter = unknown>(
  items: readonly TEntity[],
  query: {
    filter?: MatchPredicate<TEntity>;
    sortBy?: (left: TEntity, right: TEntity) => number;
    limit?: number;
    cursor?: string;
  },
): CursorWindow<TEntity> => {
  const pageSize = normalizeLimit(query.limit);
  const start = parseCursor(query.cursor);
  const filtered = query.filter ? items.filter(query.filter) : [...items];
  const ordered = query.sortBy ? [...filtered].sort(query.sortBy) : filtered;

  const window = ordered.slice(start, start + pageSize);
  const nextIndex = start + window.length < ordered.length ? start + window.length : undefined;
  return {
    items: window,
    nextCursor: nextIndex === undefined ? undefined : buildCursor(nextIndex),
  };
};

export const readAllMatching = async <TId, TEntity>(
  repository: Repository<TId, TEntity>,
  filter: (value: TEntity) => boolean,
): Promise<TEntity[]> => {
  const all = await repository.all();
  return all.filter(filter);
};
