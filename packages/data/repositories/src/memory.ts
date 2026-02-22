import { Repository } from './interfaces';

export class InMemoryRepository<TId, TEntity> implements Repository<TId, TEntity> {
  private readonly records = new Map<string, TEntity>();
  constructor(private readonly idOf: (entity: TEntity) => TId) {}

  async findById(id: TId): Promise<TEntity | null> {
    return this.records.get(String(id)) ?? null;
  }

  async save(entity: TEntity): Promise<void> {
    this.records.set(String(this.idOf(entity)), entity);
  }

  async deleteById(id: TId): Promise<void> {
    this.records.delete(String(id));
  }

  async all(): Promise<TEntity[]> {
    return Array.from(this.records.values());
  }
}

export class VersionedRepository<TId, TEntity> extends InMemoryRepository<TId, TEntity> {
  private version = 0;

  async save(entity: TEntity): Promise<void> {
    this.version += 1;
    await super.save(entity as TEntity);
  }

  getVersion(): number {
    return this.version;
  }
}
