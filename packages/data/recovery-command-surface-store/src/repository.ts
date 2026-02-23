import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import type { PageResult } from '@shared/core';
import type { SurfaceRun, SurfacePlan, SurfaceSignal } from '@domain/recovery-command-surface-models';
import { validatePlan, validateRun } from '@domain/recovery-command-surface-models/validation';

export interface SurfaceStore {
  savePlan(plan: SurfacePlan): Promise<Result<SurfacePlan>>;
  upsertPlan(plan: SurfacePlan): Promise<Result<SurfacePlan>>;
  findPlan(planId: string): Promise<Result<SurfacePlan | undefined>>;
  listPlans(tenant: string, limit?: number): Promise<Result<PageResult<SurfacePlan>>>;
  saveRun(run: SurfaceRun): Promise<Result<SurfaceRun>>;
  findRun(runId: string): Promise<Result<SurfaceRun | undefined>>;
  listRuns(planId: string, cursor?: string): Promise<Result<PageResult<SurfaceRun>>>;
  appendSignal(runId: string, signal: SurfaceSignal): Promise<Result<SurfaceRun>>;
}

export interface MemoryStoreOptions {
  readonly maxItemsPerPlan?: number;
}

interface PlanEntry {
  readonly plan: SurfacePlan;
  readonly createdAt: number;
}

interface RunEntry {
  readonly run: SurfaceRun;
  readonly updatedAt: number;
}

export class InMemorySurfaceCommandStore implements SurfaceStore {
  private readonly plans = new Map<string, PlanEntry>();
  private readonly runs = new Map<string, RunEntry[]>();
  private readonly options: Required<MemoryStoreOptions>;

  public constructor(options: MemoryStoreOptions = {}) {
    this.options = {
      maxItemsPerPlan: options.maxItemsPerPlan ?? 64,
    };
  }

  public async savePlan(plan: SurfacePlan): Promise<Result<SurfacePlan>> {
    const validation = validatePlan(plan);
    if (!validation.ok) {
      return fail(new Error(validation.reason ?? 'invalid plan'));
    }
    this.plans.set(plan.id, { plan, createdAt: Date.now() });
    return ok(plan);
  }

  public async upsertPlan(plan: SurfacePlan): Promise<Result<SurfacePlan>> {
    const existing = await this.findPlan(plan.id);
    const normalized = {
      ...plan,
      updatedAt: new Date().toISOString(),
    };
    if (existing.ok === false) {
      return fail(existing.error);
    }
    this.plans.set(plan.id, { plan: normalized, createdAt: Date.now() });
    return ok(normalized);
  }

  public async findPlan(planId: string): Promise<Result<SurfacePlan | undefined>> {
    return ok(this.plans.get(planId)?.plan);
  }

  public async listPlans(tenant: string, limit = 25): Promise<Result<PageResult<SurfacePlan>>> {
    const normalizedLimit = Math.max(1, Math.min(200, limit));
    const plans = [...this.plans.values()]
      .map((entry) => entry.plan)
      .filter((plan) => plan.surface.tenant === tenant)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    return ok({
      items: plans.slice(0, normalizedLimit),
      nextCursor: plans.length > normalizedLimit ? String(normalizedLimit) : undefined,
      hasMore: plans.length > normalizedLimit,
    });
  }

  public async saveRun(run: SurfaceRun): Promise<Result<SurfaceRun>> {
    const validation = validateRun(run);
    if (!validation.ok) {
      return fail(new Error(validation.detail));
    }
    const list = this.runs.get(run.planId) ?? [];
    const next = [...list.filter((entry) => entry.run.id !== run.id), { run, updatedAt: Date.now() }]
      .sort((left, right) => left.updatedAt - right.updatedAt);
    const trimmed = next.slice(-this.options.maxItemsPerPlan);
    this.runs.set(run.planId, trimmed);
    return ok(run);
  }

  public async findRun(runId: string): Promise<Result<SurfaceRun | undefined>> {
    for (const list of this.runs.values()) {
      const match = list.find((entry) => entry.run.id === runId);
      if (match) {
        return ok(match.run);
      }
    }
    return ok(undefined);
  }

  public async listRuns(planId: string, cursor?: string): Promise<Result<PageResult<SurfaceRun>>> {
    const allRuns = this.runs.get(planId) ?? [];
    const start = cursor ? Number(cursor) : 0;
    const offset = Number.isFinite(start) && start > 0 ? Math.floor(start) : 0;
    const values = allRuns.slice(offset);
    const next = offset + values.length;
    return ok({
      items: values.map((entry) => entry.run),
      nextCursor: values.length > 0 ? String(next) : undefined,
      hasMore: next < allRuns.length,
    });
  }

  public async appendSignal(runId: string, signal: SurfaceSignal): Promise<Result<SurfaceRun>> {
    const current = await this.findRun(runId);
    if (current.ok === false) {
      return fail(current.error);
    }
    if (!current.value) {
      return fail(new Error(`run ${runId} does not exist`));
    }
    const next = {
      ...current.value,
      signals: [...current.value.signals, signal],
    };
    const bucket = this.runs.get(current.value.planId) ?? [];
    const updated: RunEntry[] = [];
    for (const item of bucket) {
      if (item.run.id === current.value.id) {
        updated.push({ run: next, updatedAt: Date.now() });
      } else {
        updated.push(item);
      }
    }
    this.runs.set(current.value.planId, updated);
    return ok(next);
  }
}
