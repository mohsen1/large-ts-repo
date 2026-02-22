import type { RecoveryReadinessPlan, ReadinessSignal } from '@domain/recovery-readiness';
import type { ReadinessReadModel, SignalFilter } from './models';
import { filterBySignalCriteria } from './queries';
import { artifactStats, type PersistedArtifact } from './models';

export interface ReadinessRepository {
  save(model: ReadinessReadModel): Promise<void>;
  byRun(runId: string): Promise<ReadinessReadModel | undefined>;
  search(filter: SignalFilter): Promise<ReadinessReadModel[]>;
  listActive(): Promise<ReadinessReadModel[]>;
}

export class MemoryReadinessRepository implements ReadinessRepository {
  private readonly models = new Map<string, ReadinessReadModel>();
  private stats: PersistedArtifact | undefined;

  async save(model: ReadinessReadModel): Promise<void> {
    this.models.set(model.plan.runId, model);
    this.stats = {
      namespace: 'drift-currents',
      runId: model.plan.runId,
      sha256: `in-memory:${model.plan.runId}`,
      payloadPath: `mem://${model.plan.runId}`,
      schemaVersion: model.revision
    };
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
}

export async function aggregateSignals(plan: RecoveryReadinessPlan, signals: ReadinessSignal[]): Promise<number> {
  return signals.reduce((sum, signal) => {
    const value = signal.severity === 'critical' ? 12 : signal.severity === 'high' ? 8 : signal.severity === 'medium' ? 4 : 1;
    return sum + value;
  }, plan.signals.length);
}

export async function loadStoreSummary() {
  const baseline = artifactStats(undefined);
  return {
    ...baseline,
    source: 'memory'
  };
}
