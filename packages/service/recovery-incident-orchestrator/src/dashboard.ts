import { z } from 'zod';
import type {
  IncidentPlan,
  IncidentRecord,
  OrchestrationRun,
  IncidentId,
  IncidentPlanId,
} from '@domain/recovery-incident-orchestration';
import type { RecoveryIncidentRepository, IncidentStoreState, QueryResult } from '@data/recovery-incident-store';
import {
  buildAggregate,
  collectIncidentPlanStats,
  summarizeRunHealth,
} from '@data/recovery-incident-store';
import type { IncidentPlanRecord, IncidentRunRecord, IncidentStoreEvent } from '@data/recovery-incident-store';
import { rankIncidents, type IncidentPriorityVector, buildPriorityWindow } from '@domain/recovery-incident-orchestration';
import { buildIncidentTrend, buildStoreAnalytics, type StoreAnalytics } from '@data/recovery-incident-store';

const dashboardPolicySchema = z.object({
  tenantId: z.string().min(1),
  includeResolved: z.boolean().optional(),
  maxPlans: z.number().int().positive().max(200).optional(),
});

export type DashboardPolicyInput = z.infer<typeof dashboardPolicySchema>;

export interface DashboardKpi {
  readonly generatedAt: string;
  readonly totalIncidents: number;
  readonly unresolvedIncidents: number;
  readonly totalRuns: number;
  readonly failedRuns: number;
  readonly healthScore: number;
}

export interface DashboardSnapshot {
  readonly kpi: DashboardKpi;
  readonly topPriority: readonly IncidentPriorityVector[];
  readonly topPlans: readonly IncidentPlanRecord[];
  readonly incidentTrend: readonly {
    readonly key: string;
    readonly total: number;
    readonly resolved: number;
    readonly escalationCount: number;
    readonly averageSignals: number;
  }[];
  readonly analytics: StoreAnalytics;
  readonly planStats: readonly {
    readonly incidentId: IncidentId;
    readonly planId: string;
    readonly riskScore: number;
    readonly isApproved: boolean;
  }[];
}

export interface RunProfile {
  readonly runId: string;
  readonly incidentId: IncidentId;
  readonly state: OrchestrationRun['state'];
  readonly ageMinutes: number;
  readonly nodeId: OrchestrationRun['nodeId'];
}

export interface TimelineInput {
  readonly tenantId?: string;
  readonly unresolvedOnly?: boolean;
  readonly limit?: number;
}

const runAgeMinutes = (run: OrchestrationRun): number => {
  if (!run.finishedAt) {
    return Math.max(0, (Date.now() - Date.parse(run.startedAt)) / 60_000);
  }
  return Math.max(0, (Date.parse(run.finishedAt) - Date.parse(run.startedAt)) / 60_000);
};

export const buildRunProfiles = (runs: readonly OrchestrationRun[]): readonly RunProfile[] =>
  runs.map((run) => ({
    runId: run.id,
    incidentId: run.nodeId as unknown as IncidentId,
    state: run.state,
    ageMinutes: Number(runAgeMinutes(run).toFixed(2)),
    nodeId: run.nodeId,
  }));

export const buildDashboardSnapshot = async (
  repository: RecoveryIncidentRepository,
  rawInput: DashboardPolicyInput,
): Promise<DashboardSnapshot> => {
  const input = dashboardPolicySchema.parse(rawInput);
  const incidents = await repository.findIncidents({
    tenantId: input.tenantId,
    unresolvedOnly: !input.includeResolved,
    limit: input.maxPlans ?? 200,
  });

  const plans = (await Promise.all(
    incidents.data.map((incident) => repository.findPlans(incident.id)),
  )).flat();
  const runs = (await Promise.all(
    incidents.data.map((incident) => repository.getRuns(incident.id)),
  )).flat();
  const runRecords: IncidentRunRecord[] = runs.map((run, index) => ({
    id: `${index}:${run.id}` as IncidentRunRecord['id'],
    runId: run.id,
    planId: run.planId as IncidentPlanId,
    itemId: run.nodeId,
    run,
    status: run.state === 'failed' ? 'failed' : run.state === 'done' ? 'done' : run.state === 'running' ? 'running' : 'queued',
  }));

  const events = incidents.data.flatMap((incident) => {
    const plansForIncident = plans.filter((plan) => plan.incidentId === incident.id);
    return plansForIncident.map((plan) => ({
      id: `${plan.id}:event`,
      incidentId: plan.incidentId,
      type: 'plan_added' as const,
      payload: {
        planId: String(plan.id),
      },
      emittedAt: new Date().toISOString(),
    })) as IncidentStoreEvent[];
  });

  const state: IncidentStoreState = {
    incidents: incidents.data.map((incident) => ({
      id: incident.id,
      version: 1,
      label: incident.title,
      incident,
    })),
    plans,
    runs: runRecords,
    events,
  };

  const aggregate = buildAggregate(incidents.data);
  const analytics = buildStoreAnalytics(state);
  const priorityWindow = buildPriorityWindow(incidents.data, input.tenantId);
  void priorityWindow;
  const topPriority = rankIncidents(incidents.data, {
    maxDependencyPressure: 10,
    maxTenantShare: 12,
    minSignalRatio: 0.2,
  }).slice(0, 30);

  const planStats = collectIncidentPlanStats(plans);
  const topPlans = plans.slice(0, 30);
  const trend = buildIncidentTrend(incidents);
  const runSummary = summarizeRunHealth(runRecords);

  const resolved = incidents.data.filter((incident) => Boolean(incident.resolvedAt)).length;

  return {
    kpi: {
      generatedAt: new Date().toISOString(),
      totalIncidents: incidents.total,
      unresolvedIncidents: incidents.total - resolved,
      totalRuns: runs.length,
      failedRuns: runSummary.failed,
      healthScore: runSummary.healthScore,
    },
    topPriority,
    topPlans,
    incidentTrend: trend,
    analytics,
    planStats,
  };
};

export const buildTopIncidentTimeline = (incidents: readonly IncidentRecord[], limit = 8): readonly {
  readonly incidentId: IncidentId;
  readonly severity: IncidentRecord['severity'];
  readonly title: string;
  readonly score: number;
}[] => incidents
  .map((incident) => ({
    incidentId: incident.id,
    severity: incident.severity,
    title: incident.title,
    score: rankIncidents([incident], {
      maxDependencyPressure: 10,
      maxTenantShare: 10,
      minSignalRatio: 0.4,
    })[0]?.compositeScore ?? 0,
  }))
  .sort((left, right) => right.score - left.score)
  .slice(0, limit);

export const fetchIncidentTimeline = async (
  repository: RecoveryIncidentRepository,
  input: TimelineInput,
): Promise<{
  readonly incidents: QueryResult<IncidentRecord>;
  readonly snapshots: readonly {
    readonly planCount: number;
    readonly runCount: number;
  }[];
}> => {
  const incidents = await repository.findIncidents({
    tenantId: input.tenantId,
    unresolvedOnly: input.unresolvedOnly,
    limit: input.limit,
  });
  const rollups = await Promise.all(incidents.data.map((incident) => {
    return repository.findPlans(incident.id).then((plans) => {
      const runCount = plans.length;
      return {
        planCount: plans.length,
        runCount,
      };
    });
  }));

  return {
    incidents,
    snapshots: rollups,
  };
};

export const listAffectedTenants = async (
  incidents: readonly IncidentRecord[],
): Promise<readonly string[]> =>
  Array.from(new Set(incidents.map((incident) => incident.scope.tenantId))).sort();

export const filterPlans = (plans: readonly IncidentPlan[], minRisk = 0): readonly IncidentPlan[] =>
  plans.filter((plan) => plan.riskScore >= minRisk);

export const buildPlanCoverage = (plans: readonly IncidentPlan[]) => {
  const approved = plans.filter((plan) => plan.approved).length;
  const ratio = plans.length === 0 ? 0 : approved / plans.length;
  return {
    total: plans.length,
    approved,
    unapproved: plans.length - approved,
    approvalRatio: Number(ratio.toFixed(4)),
  };
};

export { buildIncidentTrend } from '@data/recovery-incident-store';
