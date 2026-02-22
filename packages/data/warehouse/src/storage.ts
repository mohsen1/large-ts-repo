export interface SnapshotPoint {
  version: number;
  at: Date;
  rows: number;
}

export interface SnapshotStore {
  save(point: SnapshotPoint): Promise<void>;
  latest(): Promise<SnapshotPoint | undefined>;
}

export class InMemorySnapshotStore implements SnapshotStore {
  private points: SnapshotPoint[] = [];

  async save(point: SnapshotPoint): Promise<void> {
    this.points.push(point);
  }

  async latest(): Promise<SnapshotPoint | undefined> {
    return this.points.slice().sort((a, b) => b.version - a.version)[0];
  }
}

export class SnapshotManager {
  constructor(private readonly store: SnapshotStore) {}

  async checkpoint(rows: number): Promise<SnapshotPoint> {
    const latest = await this.store.latest();
    const version = (latest?.version ?? 0) + 1;
    const point: SnapshotPoint = { version, at: new Date(), rows };
    await this.store.save(point);
    return point;
  }
}
