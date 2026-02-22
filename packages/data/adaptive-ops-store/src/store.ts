import { InMemoryRepository, Repository } from '@data/repositories';
import { AdaptiveRun, AdaptivePolicy, AdaptiveDecision } from '@domain/adaptive-ops';
import { AdaptiveRunId, RunRow, RunDecisionRecord } from './models';

export interface SaveStatus {
  ok: boolean;
}

export interface AdaptiveRunStore {
  saveRun(run: AdaptiveRun): Promise<SaveStatus>;
  appendDecision(runId: AdaptiveRunId, policy: AdaptivePolicy, decision: AdaptiveDecision): Promise<void>;
  getRun(runId: AdaptiveRunId): Promise<RunRow | null>;
  allRuns(): Promise<readonly RunRow[]>;
}

export class InMemoryAdaptiveRunStore implements AdaptiveRunStore {
  private readonly repo = new InMemoryRepository<AdaptiveRunId, RunRow>((row) => row.id);

  async saveRun(run: AdaptiveRun): Promise<SaveStatus> {
    const row = this.toRow(run);
    await this.repo.save(row);
    return { ok: true };
  }

  async appendDecision(runId: AdaptiveRunId, policy: AdaptivePolicy, decision: AdaptiveDecision): Promise<void> {
    const current = await this.getRun(runId);
    if (!current) return;

    const record: RunDecisionRecord = {
      runId,
      policy,
      decision,
      createdAt: new Date().toISOString(),
    };

    await this.repo.save({
      ...current,
      decisions: [...current.decisions, record],
      run: {
        ...current.run,
        decisions: [...current.run.decisions, decision],
        updatedAt: new Date().toISOString(),
        status: 'running',
      },
    });
  }

  async getRun(runId: AdaptiveRunId): Promise<RunRow | null> {
    return this.repo.findById(runId);
  }

  async allRuns(): Promise<readonly RunRow[]> {
    return this.repo.all();
  }

  private toRow(run: AdaptiveRun): RunRow {
    return {
      id: run.incidentId as unknown as AdaptiveRunId,
      tenantId: run.policyId as never,
      run,
      decisions: [],
    };
  }
}

export class RepositoryBackedAdaptiveRunStore implements AdaptiveRunStore {
  constructor(private readonly repository: Repository<AdaptiveRunId, RunRow>) {}

  async saveRun(run: AdaptiveRun): Promise<SaveStatus> {
    const row = this.toRow(run);
    await this.repository.save(row);
    return { ok: true };
  }

  async appendDecision(runId: AdaptiveRunId, policy: AdaptivePolicy, decision: AdaptiveDecision): Promise<void> {
    const current = await this.repository.findById(runId);
    if (!current) return;
    const nextRecord: RunDecisionRecord = {
      runId,
      policy,
      decision,
      createdAt: new Date().toISOString(),
    };
    await this.repository.save({
      ...current,
      decisions: [...current.decisions, nextRecord],
      run: {
        ...current.run,
        updatedAt: new Date().toISOString(),
        decisions: [...current.run.decisions, decision],
      },
    });
  }

  async getRun(runId: AdaptiveRunId): Promise<RunRow | null> {
    return this.repository.findById(runId);
  }

  async allRuns(): Promise<readonly RunRow[]> {
    return this.repository.all();
  }

  private toRow(run: AdaptiveRun): RunRow {
    return {
      id: run.incidentId as unknown as AdaptiveRunId,
      tenantId: run.policyId as never,
      run,
      decisions: [],
    };
  }
}
