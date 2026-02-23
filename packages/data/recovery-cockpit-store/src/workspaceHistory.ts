import { Result, ok, fail } from '@shared/result';
import { PlanId, RecoveryPlan, RuntimeRun, toTimestamp, AuditContext } from '@domain/recovery-cockpit-models';
import { InMemoryCockpitStore, QueryFilter, CockpitStore } from './memoryRepository';

export type WorkspaceRevision = {
  readonly at: string;
  readonly actor: AuditContext['actor']['id'];
  readonly action: 'plan-upsert' | 'run-upsert' | 'event-publish' | 'event-read';
  readonly planId: PlanId;
  readonly summary: string;
};

export type TimelineQuery = {
  readonly planId?: PlanId;
  readonly from?: string;
  readonly to?: string;
  readonly limit?: number;
};

export type TimelineSlice = {
  readonly count: number;
  readonly revisions: ReadonlyArray<WorkspaceRevision>;
};

export type WorkspaceHistory = {
  readonly snapshot: (planId: PlanId) => Promise<Result<PlanSnapshot | undefined, string>>;
  readonly list: (query?: TimelineQuery) => Promise<TimelineSlice>;
  readonly archive: (planId: PlanId) => void;
};

export type PlanSnapshot = {
  readonly planId: PlanId;
  readonly plan: RecoveryPlan;
  readonly runs: readonly RuntimeRun[];
  readonly actionCount: number;
  readonly createdAt: string;
};

const withinWindow = (value: string, from?: string, to?: string): boolean => {
  const current = new Date(value).getTime();
  if (from && current < new Date(from).getTime()) return false;
  if (to && current > new Date(to).getTime()) return false;
  return true;
};

export const createWorkspaceHistory = (store: CockpitStore): WorkspaceHistory => {
  const revisions: WorkspaceRevision[] = [];
  const archived = new Set<PlanId>();

  const append = (entry: WorkspaceRevision) => {
    revisions.push({
      ...entry,
      at: toTimestamp(new Date()),
    });
    if (revisions.length > 800) {
      revisions.splice(0, revisions.length - 800);
    }
  };

  return {
    snapshot: async (planId: PlanId) => {
      if (archived.has(planId)) {
        return ok(undefined);
      }
      const planResult = await store.getPlan(planId);
      if (!planResult.ok) {
        return fail(planResult.error);
      }
      const plan = planResult.value;
      if (!plan) {
        return ok(undefined);
      }
      const runResult = await store.listRuns(planId);
      if (!runResult.ok) {
        return fail(runResult.error);
      }
      append({
        at: new Date().toISOString(),
        actor: 'history' as AuditContext['actor']['id'],
        action: 'plan-upsert',
        planId,
        summary: `${plan.labels.short} actions=${plan.actions.length}`,
      });
      return ok({
        planId,
        plan,
        runs: runResult.value,
        actionCount: plan.actions.length,
        createdAt: toTimestamp(new Date()),
      });
    },
    list: async (query = {}) => {
      const filtered = revisions.filter((revision) => {
        if (query.planId && revision.planId !== query.planId) return false;
        return withinWindow(revision.at, query.from, query.to);
      });
      const limit = Math.max(1, query.limit ?? 200);
      return {
        count: filtered.length,
        revisions: filtered.slice(-limit).reverse(),
      };
    },
    archive: (planId: PlanId) => {
      archived.add(planId);
      for (const plan of revisions.filter((revision) => revision.planId === planId)) {
        append({
          ...plan,
          action: 'event-read',
          summary: `archive ${plan.planId}`,
        });
      }
    },
  };
};

export const applyHistorySeed = async (
  history: WorkspaceHistory,
  plan: RecoveryPlan,
): Promise<Result<RecoveryPlan | undefined, string>> => {
  const snapshotResult = await history.snapshot(plan.planId);
  if (!snapshotResult.ok) {
    return fail(snapshotResult.error);
  }
  return ok(snapshotResult.value?.plan);
};

export const queryHistoryByPlan = async (
  store: InMemoryCockpitStore,
  filter: QueryFilter,
): Promise<ReadonlyArray<PlanId>> => {
  const plans = await store.listPlans(filter);
  if (!plans.ok) {
    return [];
  }
  return plans.value.map((plan) => plan.planId);
};
