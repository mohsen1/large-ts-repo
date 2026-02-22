import type { Brand } from '@shared/core';
import { withBrand } from '@shared/core';
import type { RecoveryOperationsEnvelope } from '@domain/recovery-operations-models';
import {
  normalizeRehearsalSummary,
  type RehearsalExecutionRecord,
  type RehearsalId,
  type RehearsalPlan,
  type RehearsalQueryFilter,
  type RehearsalRunId,
  type RehearsalSignal,
  type RehearsalStep,
  type RehearsalSummary,
} from '@domain/recovery-operations-models';

export interface RehearsalPlanRecord {
  readonly plan: RehearsalPlan;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RehearsalTimelineSummary extends Omit<RehearsalSummary, 'tenant'> {
  readonly tenant: Brand<string, 'TenantId'>;
}

export interface RehearsalRepository {
  savePlan(plan: RehearsalPlan): Promise<void>;
  loadPlan(runId: RehearsalRunId): Promise<RehearsalPlan | undefined>;
  queryPlans(filter?: RehearsalQueryFilter): Promise<readonly RehearsalPlan[]>;
  appendExecution(record: RehearsalExecutionRecord): Promise<void>;
  latestExecution(runId: RehearsalRunId): Promise<RehearsalExecutionRecord | undefined>;
  appendSignals(runId: RehearsalRunId, signals: readonly RehearsalSignal[]): Promise<void>;
  querySignals(runId: RehearsalRunId): Promise<readonly RehearsalSignal[]>;
}

const matchesPlan = (plan: RehearsalPlan, filter?: RehearsalQueryFilter): boolean => {
  if (!filter) return true;
  if (filter.ticketId && plan.ticketId !== filter.ticketId) return false;
  if (filter.mode && !filter.mode.includes(plan.mode)) return false;
  if (filter.riskLevel && !filter.riskLevel.includes(plan.riskLevel)) return false;
  if (filter.status) return true;
  return true;
};

export class InMemoryRehearsalRepository implements RehearsalRepository {
  private readonly plans = new Map<string, RehearsalPlanRecord>();
  private readonly executions = new Map<string, RehearsalExecutionRecord[]>();
  private readonly signals = new Map<string, RehearsalSignal[]>();
  private readonly summaries = new Map<string, RehearsalTimelineSummary>();

  async savePlan(plan: RehearsalPlan): Promise<void> {
    const key = String(plan.runId);
    const now = new Date().toISOString();
    this.plans.set(key, {
      plan,
      createdAt: now,
      updatedAt: now,
    });
  }

  async loadPlan(runId: RehearsalRunId): Promise<RehearsalPlan | undefined> {
    const record = this.plans.get(String(runId));
    return record?.plan;
  }

  async queryPlans(filter?: RehearsalQueryFilter): Promise<readonly RehearsalPlan[]> {
    const records = Array.from(this.plans.values());
    return records
      .map((record) => record.plan)
      .filter((plan) => matchesPlan(plan, filter))
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  }

  async appendExecution(record: RehearsalExecutionRecord): Promise<void> {
    const runId = String(record.runId);
    const current = this.executions.get(runId) ?? [];
    const sorted = [...current, record].sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt));
    this.executions.set(runId, sorted);

    const summary = normalizeRehearsalSummary({
      ...record.summary,
      planId: record.summary.planId ?? withBrand(runId, 'RehearsalId'),
      tenant: withBrand(runId.split(':')[0] ?? 'default-tenant', 'TenantId'),
    });

    this.summaries.set(runId, {
      ...summary,
      tenant: withBrand(runId, 'TenantId'),
    });
  }

  async latestExecution(runId: RehearsalRunId): Promise<RehearsalExecutionRecord | undefined> {
    const records = this.executions.get(String(runId)) ?? [];
    return records[0];
  }

  async appendSignals(runId: RehearsalRunId, newSignals: readonly RehearsalSignal[]): Promise<void> {
    const key = String(runId);
    const current = this.signals.get(key) ?? [];
    const envelope: RecoveryOperationsEnvelope<{ signalCount: number }> = {
      eventId: `${runId}-signals`,
      tenant: withBrand(runId.split(':')[0] ?? 'default-tenant', 'TenantId'),
      payload: { signalCount: newSignals.length },
      createdAt: new Date().toISOString(),
    };
    void envelope;
    const normalized = newSignals.map((signal) => ({
      ...signal,
      runId,
      tenant: withBrand(String(signal.runId), 'TenantId'),
      observedAt: new Date(signal.observedAt).toISOString(),
    }));

    this.signals.set(key, [...current, ...normalized]);
  }

  async querySignals(runId: RehearsalRunId): Promise<readonly RehearsalSignal[]> {
    return this.signals.get(String(runId)) ?? [];
  }
}

export interface RehearsalSnapshot {
  readonly runId: RehearsalRunId;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly planId: RehearsalId;
  readonly status: RehearsalExecutionRecord['status'];
  readonly steps: readonly RehearsalStep[];
  readonly summary: RehearsalSummary;
}

export const asRehearsalSnapshot = async (
  repository: RehearsalRepository,
  runId: RehearsalRunId,
): Promise<RehearsalSnapshot | undefined> => {
  const plan = await repository.loadPlan(runId);
  const execution = await repository.latestExecution(runId);
  if (!plan || !execution) {
    return undefined;
  }

  return {
    runId,
    tenant: plan.tenant,
    planId: plan.id,
    status: execution.status,
    steps: plan.steps,
    summary: execution.summary,
  };
};
