import { Result, fail, ok } from '@shared/result';
import { AuditContext, EntityId, PlanId, RunId, toTimestamp, nextRunId, Region } from '@domain/recovery-cockpit-models';
import { RecoveryPlan, RuntimeRun, CommandEvent, RecoveryAction } from '@domain/recovery-cockpit-models';

export type QueryFilter = {
  region?: string;
  hasSignals?: boolean;
  labelsContains?: readonly string[];
  onlySafe?: boolean;
};

export interface StoreRecord<T> {
  id: string;
  value: T;
  updatedAt: string;
  version: number;
}

export interface CockpitStore {
  upsertPlan(plan: RecoveryPlan): Promise<Result<RecoveryPlan, string>>;
  getPlan(planId: PlanId): Promise<Result<RecoveryPlan | undefined, string>>;
  listPlans(filter?: QueryFilter): Promise<Result<RecoveryPlan[], string>>;
  upsertRun(run: RuntimeRun): Promise<Result<RuntimeRun, string>>;
  getRun(runId: string): Promise<Result<RuntimeRun | undefined, string>>;
  listRuns(planId: PlanId): Promise<Result<RuntimeRun[], string>>;
  publishEvent(event: CommandEvent): Promise<void>;
  getEvents(planId: PlanId, limit: number): Promise<CommandEvent[]>;
}

export class InMemoryCockpitStore implements CockpitStore {
  private readonly plans = new Map<string, StoreRecord<RecoveryPlan>>();
  private readonly runs = new Map<string, StoreRecord<RuntimeRun>>();
  private readonly events = new Map<string, CommandEvent[]>();

  async upsertPlan(plan: RecoveryPlan): Promise<Result<RecoveryPlan, string>> {
    const previous = this.plans.get(plan.planId);
    const record: StoreRecord<RecoveryPlan> = {
      id: plan.planId,
      value: plan,
      updatedAt: new Date().toISOString(),
      version: (previous?.version ?? 0) + 1,
    };
    this.plans.set(plan.planId, record);
    return ok(record.value);
  }

  async getPlan(planId: PlanId): Promise<Result<RecoveryPlan | undefined, string>> {
    return ok(this.plans.get(planId)?.value);
  }

  async listPlans(filter: QueryFilter = {}): Promise<Result<RecoveryPlan[], string>> {
    const records = Array.from(this.plans.values()).map((record) => record.value);
    const filtered = records.filter((plan) => {
      if (filter.onlySafe && !plan.isSafe) {
        return false;
      }
      if (filter.region) {
        const hasRegion = plan.actions.some((action) => action.region === filter.region);
        if (!hasRegion) return false;
      }
      if (filter.labelsContains && filter.labelsContains.length > 0) {
        const labels = new Set(plan.labels.labels);
        const requested = filter.labelsContains.every((value) => labels.has(value));
        if (!requested) return false;
      }
      return true;
    });
    return ok(filtered);
  }

  async upsertRun(run: RuntimeRun): Promise<Result<RuntimeRun, string>> {
    const record: StoreRecord<RuntimeRun> = {
      id: run.runId,
      value: run,
      updatedAt: new Date().toISOString(),
      version: this.runs.size + 1,
    };
    this.runs.set(run.runId, record);
    return ok(record.value);
  }

  async getRun(runId: string): Promise<Result<RuntimeRun | undefined, string>> {
    return ok(this.runs.get(runId)?.value);
  }

  async listRuns(planId: PlanId): Promise<Result<RuntimeRun[], string>> {
    const values = Array.from(this.runs.values())
      .map((record) => record.value)
      .filter((run) => run.planId === planId)
      .sort((a, b) => Number(new Date(b.startedAt)) - Number(new Date(a.startedAt)));
    return ok(values);
  }

  async publishEvent(event: CommandEvent): Promise<void> {
    const existing = this.events.get(event.planId) ?? [];
    const next = [...existing, event]
      .sort((a, b) => Number(new Date(a.at)) - Number(new Date(b.at)))
      .slice(-250);
    this.events.set(event.planId, next);
  }

  async getEvents(planId: PlanId, limit: number): Promise<CommandEvent[]> {
    const events = this.events.get(planId) ?? [];
    const capped = Math.max(0, Math.min(limit, events.length));
    return events.slice(-capped);
  }

  async seedPlanActions(planId: PlanId, actions: readonly RecoveryAction[]): Promise<void> {
    const current = this.plans.get(planId);
    if (!current) {
      return;
    }
    if (!filterByRegion(actions, 'us-east-1' as Region).length) {
      return;
    }
    current.value = {
      ...current.value,
      actions: [...current.value.actions, ...actions],
    };
  }
}

export const createAuditRun = (planId: PlanId, actor: AuditContext['actor']): RuntimeRun => ({
  runId: nextRunId(planId),
  planId,
  startedAt: toTimestamp(new Date()),
  state: 'active',
  activeActionIds: [],
  completedActions: [],
  failedActions: [],
  context: {
    actor,
    source: 'cockpit-orchestrator',
    requestId: nextRunId(planId),
    correlationId: Math.random().toString(36).slice(2),
  },
});

export const createEvent = (
  planId: PlanId,
  actionId: EntityId,
  runId: RunId,
  status: CommandEvent['status'],
  reason?: string,
): CommandEvent => ({
  eventId: `evt:${planId}:${Date.now()}` as EntityId,
  planId,
  runId: runId as unknown as string,
  actionId,
  at: toTimestamp(new Date()),
  status,
  reason,
});

const filterByRegion = (actions: readonly RecoveryAction[], region: Region): RecoveryAction[] =>
  actions.filter((action) => action.region === region);
