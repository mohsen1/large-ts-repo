import { Brand } from '@shared/core';
import { InMemoryRepository, Repository } from '@data/repositories';
import { ContinuityRuntimePlan, ContinuityEventEnvelope, ContinuityRunState, ContinuityTenantId, ContinuityRunId } from '@domain/continuity-orchestration';
import { ContinuityRunRecordId, RunRecordEnvelope, ContinuityRunRow, JournalQuery } from './models';
import { paginate } from './query';

export interface ContinuityJournalStore {
  save(plan: ContinuityRuntimePlan, event?: ContinuityEventEnvelope): Promise<void>;
  updateState(planId: ContinuityRunId, state: ContinuityRunState): Promise<void>;
  get(planId: ContinuityRunId): Promise<ContinuityRunRow | null>;
  query(query: JournalQuery): Promise<ReadonlyArray<ContinuityRunRow>>;
  byTenant(tenantId: ContinuityTenantId): Promise<ReadonlyArray<ContinuityRunRow>>;
}

export class InMemoryContinuityJournal implements ContinuityJournalStore {
  private readonly repo = new InMemoryRepository<ContinuityRunRecordId, ContinuityRunRow>((row) => row.id);

  async save(plan: ContinuityRuntimePlan, event?: ContinuityEventEnvelope): Promise<void> {
    const row: ContinuityRunRow = {
      id: plan.id as ContinuityRunRecordId,
      payload: plan,
      envelope: {
        runId: plan.id,
        tenantId: plan.tenantId,
        correlationId: plan.correlationId,
        state: plan.state,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
      },
      lastEvent: event,
    };
    await this.repo.save(row);
  }

  async updateState(planId: ContinuityRunId, state: ContinuityRunState): Promise<void> {
    const row = await this.repo.findById(planId);
    if (!row) return;
    const next = {
      ...row,
      envelope: {
        ...row.envelope,
        state,
        updatedAt: new Date().toISOString(),
      },
      payload: {
        ...row.payload,
        state,
        updatedAt: new Date().toISOString(),
      },
    };
    await this.repo.save(next);
  }

  async get(planId: ContinuityRunId): Promise<ContinuityRunRow | null> {
    const row = await this.repo.findById(planId);
    return row;
  }

  async query(query: JournalQuery): Promise<readonly ContinuityRunRow[]> {
    const all = await this.repo.all();
    const normalized = query.states
      ? all.filter((row) => query.states!.includes(row.envelope.state))
      : all;
    const byTenant = query.tenantId
      ? normalized.filter((row) => row.envelope.tenantId === query.tenantId)
      : normalized;
    return paginate(byTenant, query.cursor, query.limit ?? 100);
  }

  async byTenant(tenantId: ContinuityTenantId): Promise<ReadonlyArray<ContinuityRunRow>> {
    const all = await this.repo.all();
    return all.filter((row) => row.envelope.tenantId === tenantId);
  }
}

export class DelegatingRepositoryAdapter implements ContinuityJournalStore {
  constructor(private readonly repository: Repository<ContinuityRunRecordId, ContinuityRunRow>) {}

  async save(plan: ContinuityRuntimePlan, event?: ContinuityEventEnvelope): Promise<void> {
    const row = await this.repository.findById(plan.id as ContinuityRunRecordId);
    const envelope: RunRecordEnvelope = {
      runId: plan.id,
      tenantId: plan.tenantId,
      correlationId: plan.correlationId,
      state: plan.state,
      createdAt: row?.envelope.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const payload: ContinuityRunRow = {
      id: plan.id as ContinuityRunRecordId,
      envelope,
      payload: plan,
      lastEvent: event,
    };
    await this.repository.save(payload);
  }

  async updateState(planId: ContinuityRunId, state: ContinuityRunState): Promise<void> {
    const row = await this.repository.findById(planId);
    if (!row) return;
    await this.repository.save({
      ...row,
      envelope: {
        ...row.envelope,
        state,
        updatedAt: new Date().toISOString(),
      },
      payload: {
        ...row.payload,
        state,
        updatedAt: new Date().toISOString(),
      },
    });
  }

  async get(planId: ContinuityRunId): Promise<ContinuityRunRow | null> {
    return this.repository.findById(planId);
  }

  async query(query: JournalQuery): Promise<ReadonlyArray<ContinuityRunRow>> {
    const rows = await this.repository.all();
    const filtered = rows.filter((row) => {
      if (query.tenantId && row.envelope.tenantId !== query.tenantId) return false;
      if (query.states && !query.states.includes(row.envelope.state)) return false;
      return true;
    });
    return paginate(filtered, query.cursor, query.limit ?? 100);
  }

  async byTenant(tenantId: ContinuityTenantId): Promise<ReadonlyArray<ContinuityRunRow>> {
    const rows = await this.repository.all();
    return rows.filter((row) => row.envelope.tenantId === tenantId);
  }
}
