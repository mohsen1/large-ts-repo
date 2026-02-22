import { fail, ok, type Result } from '@shared/result';
import type {
  ContinuityPlanId,
  ContinuityRunContext,
  ContinuityRunId,
  ContinuityRunInput,
  ContinuityTenantId,
} from '@domain/recovery-continuity-planning';
import type { ContinuityPlanRecord, PlanArchiveSummary, PlanMetrics, PlanRunRecord, PlanStoreSnapshot } from './models';
import { cloneRecord } from './encoding';

export interface ContinuityPlanRepository {
  savePlan(plan: ContinuityPlanRecord): Promise<Result<void, Error>>;
  loadPlan(planId: ContinuityPlanId): Promise<Result<ContinuityPlanRecord | undefined, Error>>;
  listByTenant(tenantId: ContinuityTenantId): Promise<Result<readonly ContinuityPlanRecord[], Error>>;
  archivePlan(planId: ContinuityPlanId): Promise<Result<void, Error>>;
  getArchiveSummary(): Promise<Result<PlanArchiveSummary, Error>>;
}

export interface ContinuityRunRepository {
  upsertRun(run: PlanRunRecord): Promise<Result<void, Error>>;
  loadRun(tenantId: ContinuityTenantId, runId: ContinuityRunId): Promise<Result<PlanRunRecord | undefined, Error>>;
  listByTenant(tenantId: ContinuityTenantId): Promise<Result<readonly PlanRunRecord[], Error>>;
}

export interface PlanStoreSnapshotBuilder {
  materializeSnapshot(tenantId: ContinuityTenantId): Promise<Result<PlanStoreSnapshot, Error>>;
  computePlanMetrics(planId: ContinuityPlanId): Promise<Result<PlanMetrics, Error>>;
}

export interface ContinuityPlanStore extends ContinuityPlanRepository, ContinuityRunRepository, PlanStoreSnapshotBuilder {}

const toPlanSummary = (id: ContinuityRunId, tenantId: ContinuityTenantId, request: ContinuityRunInput, context: ContinuityRunContext): PlanRunRecord => ({
  runId: id,
  tenantId,
  request,
  context,
  startedAtUtc: request.createdAt,
  successCount: context.steps.filter((step) => step.status === 'done').length,
  failCount: context.steps.filter((step) => step.status === 'failed').length,
  notes: [...context.trace],
});

export class InMemoryContinuityPlanStore implements ContinuityPlanStore {
  private readonly plans = new Map<string, ContinuityPlanRecord>();
  private readonly runs = new Map<string, PlanRunRecord>();
  private readonly tenantPlanIds = new Map<string, Set<ContinuityPlanId>>();
  private readonly tenantRunIds = new Map<string, Set<ContinuityRunId>>();

  async savePlan(plan: ContinuityPlanRecord): Promise<Result<void, Error>> {
    try {
      this.plans.set(plan.id, cloneRecord(plan));

      const tenantPlans = this.tenantPlanIds.get(plan.tenantId) ?? new Set<ContinuityPlanId>();
      tenantPlans.add(plan.id);
      this.tenantPlanIds.set(plan.tenantId, tenantPlans);

      return ok(undefined);
    } catch (error) {
      return fail(error as Error);
    }
  }

  async loadPlan(planId: ContinuityPlanId): Promise<Result<ContinuityPlanRecord | undefined, Error>> {
    return ok(this.plans.get(planId) ? cloneRecord(this.plans.get(planId)!) : undefined);
  }

  async listByTenant(tenantId: ContinuityTenantId): Promise<Result<readonly ContinuityPlanRecord[], Error>> {
    const ids = this.tenantPlanIds.get(tenantId) ?? new Set<ContinuityPlanId>();
    const plans = Array.from(ids).map((id) => this.plans.get(id)).filter(Boolean) as ContinuityPlanRecord[];
    return ok(plans.map(cloneRecord));
  }

  async archivePlan(planId: ContinuityPlanId): Promise<Result<void, Error>> {
    const current = this.plans.get(planId);
    if (!current) return fail(new Error(`plan-not-found:${planId}`));

    this.plans.set(planId, {
      ...current,
      archived: true,
      archivedAt: new Date().toISOString(),
      tags: [...current.tags, 'archived'],
    });
    return ok(undefined);
  }

  async getArchiveSummary(): Promise<Result<PlanArchiveSummary, Error>> {
    const tenantBuckets = new Map<string, number>();
    let totalArchived = 0;
    let planIds: ContinuityPlanId[] = [];

    for (const [planId, plan] of this.plans) {
      if (!plan.archived) continue;
      const key = String(plan.tenantId);
      tenantBuckets.set(key, (tenantBuckets.get(key) ?? 0) + 1);
      totalArchived += 1;
      planIds.push(planId);
    }

    const tenantCounts = Object.fromEntries(Array.from(tenantBuckets.entries())) as Record<
      typeof tenantBuckets extends Map<infer K, number> ? K & string : never,
      number
    >;

    return ok({
      totalArchived,
      tenantCounts,
      planIds,
    });
  }

  async upsertRun(run: PlanRunRecord): Promise<Result<void, Error>> {
    try {
      const tenantRuns = this.tenantRunIds.get(run.tenantId) ?? new Set<ContinuityRunId>();
      tenantRuns.add(run.runId);
      this.tenantRunIds.set(run.tenantId, tenantRuns);
      this.runs.set(`${run.tenantId}:${run.runId}`, cloneRecord(run));
      return ok(undefined);
    } catch (error) {
      return fail(error as Error);
    }
  }

  async loadRun(
    tenantId: ContinuityTenantId,
    runId: ContinuityRunId,
  ): Promise<Result<PlanRunRecord | undefined, Error>> {
    const run = this.runs.get(`${tenantId}:${runId}`);
    return ok(run ? cloneRecord(run) : undefined);
  }

  async listByTenant(tenantId: ContinuityTenantId): Promise<Result<readonly PlanRunRecord[], Error>> {
    const ids = this.tenantRunIds.get(tenantId) ?? new Set<ContinuityRunId>();
    const runs = Array.from(ids)
      .map((id) => this.runs.get(`${tenantId}:${id}`))
      .filter(Boolean)
      .sort((left, right) => String(right?.startedAtUtc).localeCompare(String(left?.startedAtUtc)))
      .map((run) => cloneRecord(run!));

    return ok(runs);
  }

  async materializeSnapshot(tenantId: ContinuityTenantId): Promise<Result<PlanStoreSnapshot, Error>> {
    const planList = await this.listByTenant(tenantId);
    if (!planList.ok) return fail(planList.error);

    const runList = await this.listByTenant(tenantId);
    if (!runList.ok) return fail(runList.error as Error);

    const activeRuns = runList.value.filter((run) => run.context.state !== 'completed' && run.context.state !== 'canceled');
    const recentRunFailures = runList.value.filter((run) => run.failCount > run.successCount).length;

    return ok({
      tenantId,
      activePlanCount: planList.value.length,
      activeRunCount: activeRuns.length,
      recentRunFailures,
      updatedAtUtc: new Date().toISOString(),
    });
  }

  async computePlanMetrics(planId: ContinuityPlanId): Promise<Result<PlanMetrics, Error>> {
    const records = Array.from(this.runs.values()).filter((run) => run.request.planId === planId);
    if (!records.length) {
      return fail(new Error(`metrics-empty:${planId}`));
    }

    const tenantId = records[0]?.tenantId;
    const total = records.length;
    const successful = records.filter((record) => record.failCount === 0).length;
    const successRate = total ? successful / total : 0;
    const runDurations = records
      .filter((record) => record.finishedAtUtc)
      .map((record) => Date.parse(record.finishedAtUtc!) - Date.parse(record.startedAtUtc));

    const avgRuntimeMinutes = runDurations.length
      ? runDurations.reduce((sum, duration) => sum + duration, 0) / runDurations.length / 60000
      : 0;

    const criticalRunCount = records.filter((record) => record.failCount > 0).length;

    return ok({
      tenantId: tenantId!,
      planId,
      successRate,
      avgRuntimeMinutes,
      criticalRunCount,
    });
  }
}

export const createRunFromInput = (
  input: ContinuityRunInput,
  context: ContinuityRunContext,
  options: {
    requestor: string;
    reason: string;
  },
): PlanRunRecord => ({
  ...toPlanSummary(input.runId, input.tenantId, input, context),
  runId: input.runId,
  tenantId: input.tenantId,
  request: input,
  context,
  notes: [
    ...context.trace,
    `requestedBy:${options.requestor}`,
    `reason:${options.reason}`,
    `tenant:${input.tenantId}`,
  ],
  successCount: context.steps.filter((step) => step.status === 'done').length,
  failCount: context.steps.filter((step) => step.status === 'failed').length,
  startedAtUtc: context.startedAt,
});
