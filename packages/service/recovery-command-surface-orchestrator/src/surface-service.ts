import { fail, ok, type Result } from '@shared/result';
import type {
  CommandSurfaceId,
  SimulationContext,
  SurfacePlan,
  SurfaceRun,
  SurfaceSignal,
} from '@domain/recovery-command-surface-models';
import {
  buildExecutionPlan,
  startRunFromPlan,
  appendStep,
} from '@domain/recovery-command-surface-models/planner';
import type { InMemorySurfaceCommandStore } from '@data/recovery-command-surface-store/repository';

export interface WorkspaceSummary {
  readonly tenant: string;
  readonly scope: string;
  readonly planCount: number;
  readonly runCount: number;
  readonly latestRunState: SurfaceRun['state'] | 'none';
}

export interface CommandSurfaceServiceConfig {
  readonly repository: InMemorySurfaceCommandStore;
  readonly tenant: string;
  readonly scopeLabel: string;
}

export class CommandSurfaceOrchestratorService {
  private readonly repository: InMemorySurfaceCommandStore;
  private readonly tenant: string;
  private readonly scopeLabel: string;

  public constructor(config: CommandSurfaceServiceConfig) {
    this.repository = config.repository;
    this.tenant = config.tenant;
    this.scopeLabel = config.scopeLabel;
  }

  public async publishPlan(plan: SurfacePlan): Promise<Result<SurfacePlan>> {
    return this.repository.savePlan(plan);
  }

  public async startRun(planId: string, requestedBy: string, scenario: string): Promise<Result<SurfaceRun>> {
    const planResult = await this.repository.findPlan(planId);
    if (!planResult.ok) {
      return fail(new Error(`plan lookup failed ${planId}`));
    }
    if (!planResult.value) {
      return fail(new Error(`plan ${planId} missing`));
    }
    const run = startRunFromPlan(planResult.value, { tenant: this.tenant, requestedBy, scenario });
    return this.repository.saveRun(run);
  }

  public async addSignal(runId: string, signal: SurfaceSignal): Promise<Result<SurfaceRun>> {
    return this.repository.appendSignal(runId, signal);
  }

  public async advanceStep(runId: string, commandId: CommandSurfaceId): Promise<Result<SurfaceRun>> {
    const runResult = await this.repository.findRun(runId);
    if (!runResult.ok || !runResult.value) {
      return fail(new Error(`run ${runId} missing`));
    }
    const current = runResult.value;
    const next = appendStep(current, {
      commandId,
      executor: this.scopeLabel,
      host: this.scopeLabel,
      output: { advancedAt: new Date().toISOString() },
    });
    return this.repository.saveRun(next);
  }

  public async summarize(contextLimit = 20): Promise<WorkspaceSummary> {
    const plans = await this.repository.listPlans(this.tenant, contextLimit);
    if (!plans.ok) {
      return {
        tenant: this.tenant,
        scope: this.scopeLabel,
        planCount: 0,
        runCount: 0,
        latestRunState: 'none',
      };
    }
    let latestRunState: SurfaceRun['state'] | 'none' = 'none';
    let runCount = 0;
    for (const plan of plans.value.items) {
      const runPage = await this.repository.listRuns(plan.id);
      if (runPage.ok && runPage.value.items.length > 0) {
        runCount += runPage.value.items.length;
        const sorted = [...runPage.value.items].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
        const latest = sorted[sorted.length - 1];
        if (latest) {
          latestRunState = latest.state;
        }
      }
    }
    return {
      tenant: this.tenant,
      scope: this.scopeLabel,
      planCount: plans.value.items.length,
      runCount,
      latestRunState,
    };
  }

  public async simulate(planId: string, currentState: SurfaceRun): Promise<Result<SimulationContext>> {
    const planResult = await this.repository.findPlan(planId);
    if (!planResult.ok || !planResult.value) {
      return fail(new Error(`plan ${planId} not found`));
    }
    const plan = planResult.value;
    const executionPlan = buildExecutionPlan(plan);
    return ok({
      run: currentState,
      currentTimestamp: new Date().toISOString(),
      globalBudgetMinutes: executionPlan.estimatedRisk + 10,
    });
  }

  public async listPlans(tenant: string, limit = 20): Promise<ReadonlyArray<SurfacePlan>> {
    const plans = await this.repository.listPlans(tenant, limit);
    if (plans.ok) {
      return plans.value.items;
    }
    return [];
  }

  public async listRuns(planId: string): Promise<ReadonlyArray<SurfaceRun>> {
    const runs = await this.repository.listRuns(planId);
    if (runs.ok) {
      return runs.value.items;
    }
    return [];
  }
}
