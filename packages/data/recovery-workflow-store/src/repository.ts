import { InMemoryRepository as BaseInMemoryRepository, VersionedRepository } from '@data/repositories';
import {
  type WorkflowTemplate,
  type WorkflowInstance,
  type WorkflowTemplateId,
  type WorkflowInstanceId,
  type WorkflowRun,
} from '@domain/recovery-incident-workflows';
import type {
  WorkflowStoreRecord,
  WorkflowStoreSnapshot,
  WorkflowQuery,
  WorkflowQueryResult,
  WorkflowRunRecord,
} from './types';

interface Repositories {
  readonly templateRepo: BaseInMemoryRepository<WorkflowTemplateId, WorkflowTemplate>;
  readonly instanceRepo: BaseInMemoryRepository<WorkflowInstanceId, WorkflowInstance>;
  readonly runRepo: VersionedRepository<string, WorkflowRun>;
}

interface StoredBundle {
  readonly record: WorkflowStoreRecord;
  readonly createdAt: string;
}

export class RecoveryWorkflowRepository {
  private readonly repos: Repositories;
  private readonly records = new Map<string, StoredBundle>();
  private readonly runHistory = new Map<string, WorkflowRunRecord[]>();

  constructor() {
    this.repos = {
      templateRepo: new BaseInMemoryRepository<WorkflowTemplateId, WorkflowTemplate>((template) => template.id),
      instanceRepo: new BaseInMemoryRepository<WorkflowInstanceId, WorkflowInstance>((instance) => instance.id),
      runRepo: new VersionedRepository<string, WorkflowRun>((run) => run.id),
    };
  }

  private key(record: WorkflowStoreRecord): string {
    return `${String(record.planId)}:${String(record.id)}`;
  }

  async save(record: WorkflowStoreRecord): Promise<void> {
    await this.repos.templateRepo.save(record.template);
    await this.repos.instanceRepo.save(record.instance);
    for (const runId of record.instance.runIds) {
      await this.repos.runRepo.save({
        id: runId as WorkflowRun['id'],
        instanceId: record.instance.id,
        nodeId: runId,
        command: 'boot',
        result: 'skipped',
        startedAt: new Date().toISOString(),
        attempt: 0,
        output: { seeded: true },
      });
    }
    this.records.set(this.key(record), { record, createdAt: new Date().toISOString() });
  }

  async upsertRun(record: WorkflowRunRecord): Promise<void> {
    const current = this.runHistory.get(String(record.run.id)) ?? [];
    this.runHistory.set(String(record.run.id), [...current, record]);
    await this.repos.runRepo.save(record.run);
  }

  async load(recordId: string): Promise<WorkflowStoreRecord | null> {
    const found = this.records.get(recordId);
    return found ? found.record : null;
  }

  async delete(recordId: string): Promise<void> {
    this.records.delete(recordId);
  }

  async query(query: WorkflowQuery = {}): Promise<WorkflowQueryResult> {
    const filtered = [...this.records.values()].filter((entry) => {
      if (query.planId && entry.record.planId !== query.planId) {
        return false;
      }
      if (query.tenantId && !entry.record.template.scope.tenantId.includes(query.tenantId)) {
        return false;
      }
      if (query.minRisk && query.minRisk > entry.record.template.route.riskWeight) {
        return false;
      }
      return true;
    });

    const records = filtered
      .map((entry) => entry.record)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    const histories = filtered.flatMap((entry) => {
      const runs = [...(this.runHistory.get(entry.record.id) ?? [])];
      const limited = query.includeHistory ? runs : runs.slice(0, 1);
      return limited;
    });

    return {
      total: records.length,
      records,
      histories,
    };
  }

  async buildSnapshot(): Promise<WorkflowStoreSnapshot> {
    const values = [...this.records.values()].map((entry) => entry.record);
    const runs = values.flatMap((entry) => entry.instance.runIds);
    return {
      workflowCount: values.length,
      runCount: runs.length,
      lastUpdated: new Date().toISOString(),
    };
  }
}
