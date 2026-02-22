import type { SessionLifecycle, SessionQueryFilter, StoreSnapshot } from './models';
import type { RunSession, RunPlanSnapshot } from '@domain/recovery-operations-models';

export interface RecoveryOperationsRepository {
  upsertSession(session: RunSession): Promise<void>;
  upsertPlan(plan: RunPlanSnapshot): Promise<void>;
  upsertDecision(decision: any): Promise<void>;
  loadSessionByRunId(runId: string): Promise<RunSession | undefined>;
  findLifecycle(filter: SessionQueryFilter): Promise<readonly SessionLifecycle[]>;
  loadLatestSnapshot(tenant: string): Promise<StoreSnapshot | undefined>;
}

export class InMemoryRecoveryOperationsRepository implements RecoveryOperationsRepository {
  private readonly sessions = new Map<string, RunSession>();
  private readonly plans = new Map<string, RunPlanSnapshot>();
  private readonly decisions = new Map<string, any>();

  async upsertSession(session: RunSession): Promise<void> {
    this.sessions.set(`${session.runId}`, session);
  }

  async upsertPlan(plan: RunPlanSnapshot): Promise<void> {
    this.plans.set(plan.id, plan);
  }

  async upsertDecision(decision: any): Promise<void> {
    this.decisions.set(decision.ticketId, decision);
  }

  async loadSessionByRunId(runId: string): Promise<RunSession | undefined> {
    return this.sessions.get(runId);
  }

  async findLifecycle(filter: SessionQueryFilter): Promise<readonly SessionLifecycle[]> {
    return Array.from(this.sessions.values())
      .filter((session) => {
        if (filter.runId && session.runId !== filter.runId) return false;
        if (filter.ticketId && session.ticketId !== filter.ticketId) return false;
        if (Array.isArray(filter.status) && !filter.status.includes(session.status)) return false;
        if (typeof filter.status === 'string' && session.status !== filter.status) return false;
        return true;
      })
      .map((session) => ({
        id: session.id,
        runId: session.runId,
        ticketId: session.ticketId,
        status: session.status,
      }));
  }

  async loadLatestSnapshot(tenant: string): Promise<StoreSnapshot | undefined> {
    const sessions = Array.from(this.sessions.values());
    const tenantSession = sessions.find((session) => session.id.endsWith(tenant)) || sessions[0];
    if (!tenantSession) return undefined;

    const latestPlan = Array.from(this.plans.values())[0];
    const latestDecision = this.decisions.get(tenantSession.ticketId);

    return {
      tenant,
      planId: latestPlan?.id ?? 'none',
      sessions: [tenantSession],
      latestDecision,
    };
  }
}
