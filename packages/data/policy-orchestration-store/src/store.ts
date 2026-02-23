import { PolicyArtifactRepository, PolicyPlanRepository, PolicyRunRepository } from './repository';
import { PolicyStoreArtifact, PolicyStoreFilters, PolicyStorePlanSnapshot, PolicyStoreRunRecord, PolicyStoreSort } from './types';

export interface PolicyStoreFacade {
  artifact: PolicyArtifactRepository;
  plan: PolicyPlanRepository;
  run: PolicyRunRepository;
  searchArtifacts(filters: PolicyStoreFilters, sort?: PolicyStoreSort): Promise<PolicyStoreArtifact[]>;
  searchRuns(orchestratorId: string, state?: PolicyStoreRunRecord['status']): Promise<PolicyStoreRunRecord[]>;
}

export class InMemoryPolicyStore implements PolicyStoreFacade {
  public readonly artifact = new PolicyArtifactRepository();
  public readonly plan = new PolicyPlanRepository();
  public readonly run = new PolicyRunRepository();

  async searchArtifacts(filters: PolicyStoreFilters = {}, sort: PolicyStoreSort = { key: 'updatedAt', order: 'desc' }): Promise<PolicyStoreArtifact[]> {
    const records = await this.artifact.listByOrchestrator(filters.orchestratorId ?? '');
    const filtered = records.filter((record) => {
      if (!filters.orchestratorId) return false;
      if (filters.artifactId && record.artifactId !== filters.artifactId) return false;
      if (filters.states && !filters.states.includes('archived')) {
        if (!filters.states.includes(record.state)) return false;
      }
      return true;
    });

    const comparator = (left: PolicyStoreArtifact, right: PolicyStoreArtifact) => {
      const order = sort.order === 'asc' ? 1 : -1;
      if (sort.key === 'revision') {
        return (left.revision - right.revision) * order;
      }
      return left[sort.key] < right[sort.key] ? -1 * order : left[sort.key] > right[sort.key] ? 1 * order : 0;
    };
    return [...filtered].sort(comparator);
  }

  async searchRuns(orchestratorId: string, state?: PolicyStoreRunRecord['status']): Promise<PolicyStoreRunRecord[]> {
    const plans = await this.plan.listByOrchestrator(orchestratorId);
    const runs: PolicyStoreRunRecord[] = [];
    for (const plan of plans) {
      const runRecords = await this.run.listByPlan(plan.planId as string);
      for (const record of runRecords) {
        if (state && record.status !== state) continue;
        runs.push(record);
      }
    }
    return runs.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async seedDefaults(orchestratorId: string, seed: readonly PolicyStoreArtifact[]): Promise<void> {
    for (const item of seed) {
      await this.artifact.upsert({ ...item, orchestratorId: orchestratorId as PolicyStoreArtifact['orchestratorId'] });
    }
  }

  async savePlanSnapshot(snapshot: PolicyStorePlanSnapshot): Promise<void> {
    await this.plan.upsert(snapshot);
  }

  async recordRun(record: PolicyStoreRunRecord): Promise<void> {
    await this.run.upsert(record);
  }
}
