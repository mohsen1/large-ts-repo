import type { ContinuityPlanTemplate, ContinuityRunContext, ContinuityRunInput, ContinuityRunId, ContinuityPlanId, ContinuityTenantId } from '@domain/recovery-continuity-planning';

export interface ContinuityPlanRecord {
  readonly id: ContinuityPlanId;
  readonly tenantId: ContinuityTenantId;
  readonly plan: ContinuityPlanTemplate;
  readonly archived: boolean;
  readonly archivedAt?: string;
  readonly tags: readonly string[];
}

export interface PlanRunRecord {
  readonly runId: ContinuityRunId;
  readonly tenantId: ContinuityTenantId;
  readonly request: ContinuityRunInput;
  readonly context: ContinuityRunContext;
  readonly startedAtUtc: string;
  readonly finishedAtUtc?: string;
  readonly successCount: number;
  readonly failCount: number;
  readonly notes: readonly string[];
}

export interface PlanStoreSnapshot {
  readonly tenantId: ContinuityTenantId;
  readonly activePlanCount: number;
  readonly activeRunCount: number;
  readonly recentRunFailures: number;
  readonly updatedAtUtc: string;
}

export interface PlanArchiveSummary {
  readonly totalArchived: number;
  readonly tenantCounts: Readonly<Record<ContinuityTenantId, number>>;
  readonly planIds: readonly ContinuityPlanId[];
}

export interface PlanMetrics {
  readonly tenantId: ContinuityTenantId;
  readonly planId: ContinuityPlanId;
  readonly successRate: number;
  readonly avgRuntimeMinutes: number;
  readonly criticalRunCount: number;
}

export interface RunCommand {
  readonly tenantId: ContinuityTenantId;
  readonly runId: ContinuityRunId;
  readonly planId: ContinuityPlanId;
  readonly requestedBy: string;
  readonly reason: string;
  readonly runAtUtc: string;
}
