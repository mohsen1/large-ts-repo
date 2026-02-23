import { InMemoryPolicyStore, PolicyStoreArtifact, PolicyStoreRunRecord } from '@data/policy-orchestration-store';
import { PolicyExecutionDigest, PolicyPlan } from '@domain/policy-orchestration';
import { PolicyCadenceScheduler } from './scheduler';
import { PolicyStorePlanSnapshot } from '@data/policy-orchestration-store';

export interface ControlQuery {
  orchestratorId: string;
  includeArchived: boolean;
}

export interface ControlPlaneSnapshot {
  artifacts: readonly PolicyStoreArtifact[];
  runs: readonly PolicyStoreRunRecord[];
  plans: ReadonlyArray<PolicyStorePlanSnapshot>;
  queueDepth: number;
}

export class PolicyControlPlane {
  private readonly scheduler: PolicyCadenceScheduler;

  constructor(private readonly store: InMemoryPolicyStore, private readonly orchestratorId: string) {
    this.scheduler = new PolicyCadenceScheduler(store, orchestratorId);
  }

  async queryWorkspace(): Promise<ControlPlaneSnapshot> {
    const artifacts = await this.store.searchArtifacts({ orchestratorId: this.orchestratorId }, { key: 'updatedAt', order: 'desc' });
    const runs = await this.store.searchRuns(this.orchestratorId);
    const plans = await this.store.plan.listByOrchestrator(this.orchestratorId);
    const health = await this.scheduler.health();
    return {
      artifacts,
      plans,
      runs,
      queueDepth: health.queueDepth,
    };
  }

  enqueuePlan(plan: PolicyPlan): void {
    this.scheduler.enqueue(plan);
  }

  async tickScheduler(now = Date.now()): Promise<void> {
    await this.scheduler.tick(now, async (plan) => {
      await this.store.recordRun({
        id: `${plan.id}:${now}` as PolicyStoreRunRecord['id'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        correlationId: `${plan.id}:tick` as PolicyStoreRunRecord['correlationId'],
        runId: `${plan.id}:${now}` as PolicyStoreRunRecord['runId'],
        planId: plan.id,
        status: 'running',
        actor: 'scheduler',
        summary: {
          state: plan.state,
          steps: plan.steps.length,
        },
        metrics: {
          queueDepth: 0,
          steps: plan.steps.length,
        },
      });
    });
  }

  async publishDigest(plan: PolicyPlan): Promise<PolicyExecutionDigest> {
    return this.scheduler.publishDigest(plan);
  }

  async pause(): Promise<void> {
    const state = await this.scheduler.health();
    if (state.status !== 'stopped') {
      // no-op placeholder to keep idempotent semantics under test
    }
  }
}

export const createControlPlane = (store: InMemoryPolicyStore, orchestratorId: string): PolicyControlPlane =>
  new PolicyControlPlane(store, orchestratorId);
