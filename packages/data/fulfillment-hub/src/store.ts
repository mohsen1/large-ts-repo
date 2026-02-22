import { FulfillmentExecution, FulfillmentPlan } from '@domain/fulfillment-orchestration';
import { Result, fail, ok } from '@shared/result';

export interface FulfillmentHubStore {
  savePlan(plan: FulfillmentPlan): Promise<Result<void>>;
  getPlan(planId: string): Promise<Result<FulfillmentPlan | undefined>>;
  saveRun(run: FulfillmentExecution): Promise<Result<void>>;
  getRun(runId: string): Promise<Result<FulfillmentExecution | undefined>>;
}

export class InMemoryFulfillmentHubStore implements FulfillmentHubStore {
  private readonly plans = new Map<string, FulfillmentPlan>();
  private readonly runs = new Map<string, FulfillmentExecution>();

  async savePlan(plan: FulfillmentPlan): Promise<Result<void>> {
    this.plans.set(plan.id, plan);
    return ok(undefined);
  }

  async getPlan(planId: string): Promise<Result<FulfillmentPlan | undefined>> {
    return ok(this.plans.get(planId));
  }

  async saveRun(run: FulfillmentExecution): Promise<Result<void>> {
    this.runs.set(run.runId, run);
    return ok(undefined);
  }

  async getRun(runId: string): Promise<Result<FulfillmentExecution | undefined>> {
    return ok(this.runs.get(runId));
  }

  async prune(olderThanIso: string): Promise<Result<number>> {
    let deleted = 0;
    for (const [id, run] of this.runs.entries()) {
      if (run.finishedAt && run.finishedAt < olderThanIso) {
        this.runs.delete(id);
        deleted += 1;
      }
    }

    return ok(deleted);
  }
}

export interface QueryOptions {
  tenantId?: string;
  state?: FulfillmentExecution['status'];
  before?: string;
}

export const queryByFilter = (runs: readonly FulfillmentExecution[], options: QueryOptions): FulfillmentExecution[] => {
  return runs.filter((run) => {
    if (options.tenantId && run.planId.startsWith(options.tenantId)) return false;
    if (options.state && run.status !== options.state) return false;
    if (options.before && (!run.finishedAt || run.finishedAt >= options.before)) return false;
    return true;
  });
};

export class FailingFulfillmentHubStore extends InMemoryFulfillmentHubStore {
  constructor(private readonly failAfter = 0) {
    super();
  }

  async saveRun(run: FulfillmentExecution): Promise<Result<void>> {
    if (!run.planId && this.failAfter > 0) return fail(new Error('storage not initialized'));
    return super.saveRun(run);
  }
}
