export interface EntitySpec<TId, TEntity> {
  collection: string;
  id: (entity: TEntity) => TId;
}

export interface Repository<TId, TEntity> {
  findById(id: TId): Promise<TEntity | null>;
  save(entity: TEntity): Promise<void>;
  deleteById(id: TId): Promise<void>;
  all(): Promise<TEntity[]>;
}

export interface Query<TEntity, TFilter = unknown> {
  filter: TFilter;
  limit?: number;
  cursor?: string;
}
