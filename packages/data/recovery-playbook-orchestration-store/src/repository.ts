import { fail, ok, type Result } from '@shared/result';
import type {
  StoredPlanRecord,
  StoredOutcomeRecord,
  StoreQuery,
  WorkspaceState,
  WorkspaceAudit,
} from './types';
import { canPublish, inferOutcome } from '@domain/recovery-playbook-orchestration';
import type {
  DriftSignal,
  OrchestrationPlan,
  RecoveryPlaybookPolicy,
  PolicyViolation,
} from '@domain/recovery-playbook-orchestration';

interface InMemoryRecord<T> {
  id: string;
  value: T;
  workspaceId: string;
}

export class RecoveryPlaybookStore {
  private readonly plans: Map<string, InMemoryRecord<StoredPlanRecord>> = new Map();
  private readonly outcomes: Map<string, InMemoryRecord<StoredOutcomeRecord>> = new Map();
  private readonly audits: WorkspaceAudit[] = [];
  private readonly workspaces = new Map<string, WorkspaceState>();

  constructor(private readonly tenantId: string) {}

  upsertWorkspace(state: WorkspaceState): void {
    this.workspaces.set(state.workspaceId, state);
    this.audit(state.workspaceId, 'update', 'system', 'workspace_upserted');
  }

  getWorkspace(workspaceId: string): WorkspaceState | undefined {
    return this.workspaces.get(workspaceId);
  }

  savePlan(
    plan: OrchestrationPlan,
    requestedBy: string,
    workspaceId: string,
    policyVersion = 1,
  ): Result<StoredPlanRecord, Error> {
    const now = Date.now();
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      return fail(new Error(`workspace not found: ${workspaceId}`));
    }

    const record: StoredPlanRecord = {
      workspaceId,
      tenantId: this.tenantId,
      plan,
      createdAt: now,
      updatedAt: now,
      policyVersion,
      requestedBy,
    };

    const key = `${workspaceId}:${plan.id}`;
    this.plans.set(key, { id: key, value: record, workspaceId });
    this.audit(workspaceId, 'create', requestedBy, `stored_plan:${plan.id}`);

    return ok(record);
  }

  listPlans(query: StoreQuery = {}): ReadonlyArray<StoredPlanRecord> {
    return [...this.plans.values()]
      .map((entry) => entry.value)
      .filter((record) => {
        if (query.tenantId && record.tenantId !== query.tenantId) {
          return false;
        }
        if (query.policyVersion && record.policyVersion !== query.policyVersion) {
          return false;
        }
        return true;
      });
  }

  runAndRecordOutcome(
    plan: OrchestrationPlan,
    workspaceId: string,
    signals: readonly DriftSignal[],
    policyViolations: readonly PolicyViolation[] = [],
  ): Result<StoredOutcomeRecord, Error> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      return fail(new Error(`missing workspace ${workspaceId}`));
    }

    const outcome = inferOutcome(plan, signals);
    const id = `${workspaceId}:${outcome.id}`;

    const outcomeRecord: StoredOutcomeRecord = {
      workspaceId,
      outcome,
      policyViolations: [...policyViolations],
      createdAt: Date.now(),
    };

    this.outcomes.set(id, { id, value: outcomeRecord, workspaceId });
    this.audit(workspaceId, 'run', 'system', `outcome:${outcome.id}`);
    return ok(outcomeRecord);
  }

  listOutcomes(workspaceId: string): ReadonlyArray<StoredOutcomeRecord> {
    return [...this.outcomes.values()] 
      .filter((entry) => entry.workspaceId === workspaceId)
      .map((entry) => entry.value);
  }

  getAuditTrail(workspaceId: string): ReadonlyArray<WorkspaceAudit> {
    return this.audits.filter((entry) => entry.workspaceId === workspaceId);
  }

  private audit(workspaceId: string, action: WorkspaceAudit['action'], actor: string, details: string): void {
    this.audits.push({
      workspaceId,
      action,
      actor,
      at: new Date().toISOString(),
      details,
    });
  }
}

export const createRecoveryPlaybookStore = (tenantId: string): RecoveryPlaybookStore => new RecoveryPlaybookStore(tenantId);
export const canPublishAny = (outcomes: readonly StoredOutcomeRecord[]): number => outcomes.filter(({ outcome }) => canPublish(outcome)).length;
