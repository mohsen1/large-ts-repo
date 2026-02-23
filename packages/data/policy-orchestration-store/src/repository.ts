import { InMemoryRepository } from '@data/repositories';
import { PolicyStoreArtifact, PolicyStorePlanSnapshot, PolicyStoreRecordMeta, PolicyStoreRunRecord, PolicyStoreRecordId } from './types';

export interface PolicyArtifactRepo {
  upsert(record: PolicyStoreArtifact): Promise<void>;
  getLatest(orchestratorId: string, artifactId: string): Promise<PolicyStoreArtifact | null>;
  listByOrchestrator(orchestratorId: string): Promise<PolicyStoreArtifact[]>;
  remove(orchestratorId: string, artifactId: string): Promise<void>;
}

export interface PolicyPlanRepo {
  upsert(record: PolicyStorePlanSnapshot): Promise<void>;
  listByOrchestrator(orchestratorId: string): Promise<PolicyStorePlanSnapshot[]>;
  getById(planId: string): Promise<PolicyStorePlanSnapshot | null>;
}

export interface PolicyRunRepo {
  upsert(record: PolicyStoreRunRecord): Promise<void>;
  listByPlan(planId: string): Promise<PolicyStoreRunRecord[]>;
  getById(runId: string): Promise<PolicyStoreRunRecord | null>;
}

export class PolicyArtifactRepository implements PolicyArtifactRepo {
  private readonly byId = new Map<PolicyStoreRecordId, PolicyStoreArtifact>();
  private readonly byOrchestrator = new Map<string, PolicyStoreArtifact[]>();

  async upsert(record: PolicyStoreArtifact): Promise<void> {
    this.byId.set(record.id, record);
    const bucketKey = record.orchestratorId;
    const previous = this.byOrchestrator.get(bucketKey) ?? [];
    this.byOrchestrator.set(bucketKey, [record, ...previous.filter((item) => item.artifactId !== record.artifactId)]);
  }

  async getLatest(orchestratorId: string, artifactId: string): Promise<PolicyStoreArtifact | null> {
    const bucket = this.byOrchestrator.get(orchestratorId) ?? [];
    return bucket.find((item) => item.artifactId === artifactId) ?? null;
  }

  async listByOrchestrator(orchestratorId: string): Promise<PolicyStoreArtifact[]> {
    return [...(this.byOrchestrator.get(orchestratorId) ?? [])];
  }

  async remove(orchestratorId: string, artifactId: string): Promise<void> {
    const bucket = this.byOrchestrator.get(orchestratorId) ?? [];
    const kept = bucket.filter((record) => record.artifactId !== artifactId);
    this.byOrchestrator.set(orchestratorId, kept);
  }
}

export class PolicyPlanRepository implements PolicyPlanRepo {
  private readonly records = new InMemoryRepository<PolicyStoreRecordId, PolicyStorePlanSnapshot>(() => {
    return '';
  });

  async upsert(record: PolicyStorePlanSnapshot): Promise<void> {
    await this.records.save(record);
  }

  async listByOrchestrator(orchestratorId: string): Promise<PolicyStorePlanSnapshot[]> {
    const all = await this.records.all();
    return all.filter((record) => record.orchestratorId === orchestratorId);
  }

  async getById(planId: string): Promise<PolicyStorePlanSnapshot | null> {
    return await this.records.findById(planId as PolicyStoreRecordId);
  }
}

export class PolicyRunRepository implements PolicyRunRepo {
  private readonly records = new InMemoryRepository<PolicyStoreRecordId, PolicyStoreRunRecord>(() => {
    return '';
  });

  async upsert(record: PolicyStoreRunRecord): Promise<void> {
    await this.records.save(record);
  }

  async listByPlan(planId: string): Promise<PolicyStoreRunRecord[]> {
    const all = await this.records.all();
    return all.filter((record) => record.planId === planId || record.runId === runIdFromRecord(record.summary));
  }

  async getById(runId: string): Promise<PolicyStoreRunRecord | null> {
    return await this.records.findById(runId as PolicyStoreRecordId);
  }
}

const runIdFromRecord = (summary: Record<string, unknown>): string =>
  typeof summary?.['runId'] === 'string' ? (summary['runId'] as string) : '';
