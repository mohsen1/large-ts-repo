export interface EntitySpec<TId, TEntity> {
  collection: string;
  id: (entity: TEntity) => TId;
}

export interface CursorPage {
  readonly cursor?: string;
  readonly limit?: number;
}

export interface FilteredQuery<TEntity, TFilter = unknown> extends CursorPage {
  readonly filter?: TFilter;
  readonly sort?: keyof TEntity | string;
  readonly direction?: 'asc' | 'desc';
}

export type RepositoryState = 'idle' | 'booting' | 'ready' | 'drained';

export interface Repository<TId, TEntity> {
  findById(id: TId): Promise<TEntity | null>;
  save(entity: TEntity): Promise<void>;
  deleteById(id: TId): Promise<void>;
  all(): Promise<TEntity[]>;
}

export interface Query<TEntity, TFilter = unknown> {
  filter?: TFilter;
  limit?: number;
  cursor?: string;
}
