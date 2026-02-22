import type {
  ReadinessReadModel,
  SignalFilter,
  RunIndex,
  PersistedArtifact,
  StoreSnapshot,
  ReadinessRepositoryMetrics,
  ReadinessWindowDigest
} from './models';
import { filterBySignalCriteria, sortByRiskBand } from './queries';
import { artifactStats } from './adapters';

export interface ReadinessRepository {
  save(model: ReadinessReadModel): Promise<void>;
  byRun(runId: string): Promise<ReadinessReadModel | undefined>;
  search(filter: SignalFilter): Promise<ReadinessReadModel[]>;
  listActive(): Promise<ReadinessReadModel[]>;
  byRiskBand(...bands: ReadonlyArray<ReadinessReadModel['plan']['riskBand']>): Promise<ReadinessReadModel[]>;
  byOwner(owner: string): Promise<ReadinessReadModel[]>;
  runIndexFor(runId: string): Promise<RunIndex | undefined>;
  listIndices(): Promise<RunIndex[]>;
  listWindowDigest(runId: string): Promise<ReadinessWindowDigest[]>;
  metrics(): Promise<ReadinessRepositoryMetrics>;
}

export class MemoryReadinessRepository implements ReadinessRepository {
  private readonly models = new Map<string, ReadinessReadModel>();
  private readonly artifacts = new Map<string, PersistedArtifact>();
  private readonly revisions = new Map<string, number>();

  async save(model: ReadinessReadModel): Promise<void> {
    const previous = await this.byRun(model.plan.runId);
    const nextRevision = (this.revisions.get(model.plan.runId) ?? 0) + 1;
    this.revisions.set(model.plan.runId, nextRevision);

    this.models.set(model.plan.runId, {
      ...model,
      revision: nextRevision,
      updatedAt: model.updatedAt,
    });

    if (previous) {
      await this.persistArtifact(model);
    }
  }

  async byRun(runId: string): Promise<ReadinessReadModel | undefined> {
    return this.models.get(runId);
  }

  async search(filter: SignalFilter): Promise<ReadinessReadModel[]> {
    return filterBySignalCriteria(Array.from(this.models.values()), filter);
  }

  async listActive(): Promise<ReadinessReadModel[]> {
    return Array.from(this.models.values()).filter((item) => item.plan.state === 'active');
  }

  async byRiskBand(...bands: ReadonlyArray<ReadinessReadModel['plan']['riskBand']>): Promise<ReadinessReadModel[]> {
    const wanted = new Set(bands);
    return sortByRiskBand(Array.from(this.models.values()).filter((model) => wanted.has(model.plan.riskBand)));
  }

  async byOwner(owner: string): Promise<ReadinessReadModel[]> {
    return Array.from(this.models.values()).filter((item) => item.plan.metadata.owner === owner);
  }

  async runIndexFor(runId: string): Promise<RunIndex | undefined> {
    const model = await this.byRun(runId);
    if (!model) return undefined;

    return {
      runId,
      planId: model.plan.planId,
      state: model.plan.state,
      riskBand: model.plan.riskBand,
      owner: model.plan.metadata.owner,
      tags: model.plan.metadata.tags,
    };
  }

  async listIndices(): Promise<RunIndex[]> {
    return Promise.all(Array.from(this.models.keys()).map((runId) => this.runIndexFor(runId) as Promise<RunIndex>));
  }

  async listWindowDigest(runId: string): Promise<ReadinessWindowDigest[]> {
    const model = await this.byRun(runId);
    if (!model) {
      return [];
    }

    return model.plan.windows.map((window, index) => ({
      runId,
      windowIndex: index,
      activeDirectives: model.directives.length,
      criticality: model.signals.length,
      riskBand: model.plan.riskBand,
    }));
  }

  async metrics(): Promise<ReadinessRepositoryMetrics> {
    const models = Array.from(this.models.values());
    const active = models.filter((model) => model.plan.state === 'active').length;
    const snapshots = this.artifacts.size;
    const signals = models.reduce((sum, model) => sum + model.signals.length, 0);

    return {
      totalTracked: models.length,
      activeSignals: signals,
      activeRuns: active,
      snapshots,
    };
  }

  private async persistArtifact(model: ReadinessReadModel): Promise<PersistedArtifact> {
    const artifact = await artifactStats(this.artifacts.get(model.plan.runId));
    const revision = model.revision;
    const payload: PersistedArtifact = {
      namespace: 'drift-currents',
      runId: model.plan.runId,
      sha256: `sha256:${model.plan.runId}:${revision}`,
      payloadPath: `readiness/${model.plan.runId}/${revision}.json`,
      schemaVersion: revision,
    };

    this.artifacts.set(model.plan.runId, payload);
    return payload;
  }
}

export function createRunSummary(snapshot: StoreSnapshot, runCount: number): { runCount: number; signals: number; status: string } {
  const score = runCount > 0 ? Math.min(1, snapshot.totalSignals / (runCount + 1)) : 0;
  return {
    runCount,
    signals: snapshot.totalSignals,
    status: score > 0.5 ? 'healthy' : 'watch',
  };
}
