import { Repository } from './interfaces';

export interface AggregateSnapshot<TEntity> {
  readonly id: string;
  readonly version: number;
  readonly lastUpdatedAt: string;
  readonly total: number;
  readonly latest: TEntity | undefined;
}

export interface SnapshotAggregator<TEntity> {
  build: (entities: TEntity[]) => AggregateSnapshot<TEntity>;
}

export interface AggregatedRepository<TId, TEntity> {
  repository: Repository<TId, TEntity>;
}

const formatDate = (): string => new Date().toISOString();

export const buildAggregateSnapshot = <TId, TEntity extends { id: TId; updatedAt: string }>(
  entities: TEntity[],
  idBuilder: (entity: TEntity) => string,
): AggregateSnapshot<TEntity> => {
  const sorted = [...entities].sort((left, right) => Date.parse(left.updatedAt) - Date.parse(right.updatedAt));
  const latest = sorted.at(-1);
  const id = latest ? idBuilder(latest) : 'empty';
  const version = entities.length;

  return {
    id,
    version,
    lastUpdatedAt: latest?.updatedAt ?? formatDate(),
    total: entities.length,
    latest,
  };
};

export const summarizeRepository = async <TId, TEntity extends { id: TId; updatedAt: string }>(
  repo: Repository<TId, TEntity>,
): Promise<AggregateSnapshot<TEntity>> => {
  const all = await repo.all();
  const idBuilder = (entity: TEntity): string => String(entity.id);
  return buildAggregateSnapshot(all, idBuilder);
};
