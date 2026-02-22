import type {
  IncidentId,
  IncidentRecord,
  IncidentPlan,
  OrchestrationRun,
} from '@domain/recovery-incident-orchestration';
import type { IncidentPlanRecord, IncidentRunRecord, IncidentStoreState } from './types';
import type { RecoveryIncidentRepository } from './repository';

export interface IncidentPortfolioEntry {
  readonly incidentId: IncidentId;
  readonly scopeTenantId: string;
  readonly planCount: number;
  readonly runCount: number;
  readonly unresolved: boolean;
  readonly highestSeverity: IncidentRecord['severity'];
}

export interface TenantPortfolio {
  readonly tenantId: string;
  readonly activeIncidents: number;
  readonly unresolvedIncidents: number;
  readonly averagePlanCount: number;
  readonly latestEventAt: string;
}

export interface PlanHealthBucket {
  readonly planId: string;
  readonly incidentId: IncidentId;
  readonly riskScore: number;
  readonly status: 'healthy' | 'warning' | 'critical';
  readonly completedRuns: number;
}

const resolveTenant = (record: IncidentRecord): string => record.scope.tenantId;

export const buildPortfolioEntries = (
  state: IncidentStoreState,
  plansByIncident: Map<string, readonly IncidentPlanRecord[]>,
  runsByPlan: Map<string, readonly IncidentRunRecord[]>,
): readonly IncidentPortfolioEntry[] => {
  return state.incidents.map((snapshot) => {
    const incidentPlans = plansByIncident.get(snapshot.id) ?? [];
    const incidentsRuns = incidentPlans.flatMap((plan) => runsByPlan.get(String(plan.id)) ?? []);
    const incident = snapshot.incident;
    const unresolved = !Boolean(incident.resolvedAt);
    const highestSeverity = unresolved
      ? incident.severity
      : resolveHighestSeverity(snapshot.incident.signals.map(() => incident.severity));

    return {
      incidentId: snapshot.id,
      scopeTenantId: resolveTenant(incident),
      planCount: incidentPlans.length,
      runCount: incidentsRuns.length,
      unresolved,
      highestSeverity,
    };
  });
};

export const buildTenantPortfolios = (
  entries: readonly IncidentPortfolioEntry[],
): readonly TenantPortfolio[] => {
  const grouped = new Map<string, IncidentPortfolioEntry[]>();
  for (const entry of entries) {
    const existing = grouped.get(entry.scopeTenantId) ?? [];
    grouped.set(entry.scopeTenantId, [...existing, entry]);
  }

  return Array.from(grouped.entries()).map(([tenantId, incidentList]) => ({
    tenantId,
    activeIncidents: incidentList.length,
    unresolvedIncidents: incidentList.filter((entry) => entry.unresolved).length,
    averagePlanCount: Math.round(
      incidentList.reduce((sum, entry) => sum + entry.planCount, 0) / Math.max(1, incidentList.length),
    ),
    latestEventAt: new Date().toISOString(),
  }));
};

export const buildPlanHealthBuckets = (
  plansByIncident: readonly IncidentPlanRecord[],
  runs: readonly OrchestrationRun[],
): readonly PlanHealthBucket[] => {
  const runsByPlanId = new Map<string, number>();
  for (const run of runs) {
    runsByPlanId.set(String(run.planId), (runsByPlanId.get(String(run.planId)) ?? 0) + 1);
  }

  return plansByIncident.map((plan) => {
    const runCount = runsByPlanId.get(String(plan.id)) ?? 0;
    const status =
      plan.plan.riskScore > 0.8 || runCount === 0
        ? 'critical'
        : plan.plan.riskScore > 0.4 || runCount < 2
          ? 'warning'
          : 'healthy';
    return {
      planId: String(plan.id),
      incidentId: plan.incidentId,
      riskScore: plan.plan.riskScore,
      status,
      completedRuns: runCount,
    };
  });
};

export const buildRepositoryPortfolio = async (
  repo: RecoveryIncidentRepository,
): Promise<{
  readonly entries: readonly IncidentPortfolioEntry[];
  readonly tenants: readonly TenantPortfolio[];
}> => {
  const state = repo.snapshot();
  const planMap = new Map<string, IncidentPlanRecord[]>();
  for (const plan of state.plans) {
    const list = planMap.get(String(plan.incidentId)) ?? [];
    planMap.set(String(plan.incidentId), [...list, plan]);
  }

  const runMap = new Map<string, IncidentRunRecord[]>();
  for (const planRecord of state.plans) {
    const runEntries = state.runs.filter((run) => String(run.planId) === String(planRecord.id));
    runMap.set(String(planRecord.id), [...(runMap.get(String(planRecord.id)) ?? []), ...runEntries]);
  }

  const entries = buildPortfolioEntries(state, planMap, runMap);
  const tenants = buildTenantPortfolios(entries);
  return { entries, tenants };
};

const resolveHighestSeverity = (
  severities: readonly IncidentRecord['severity'][],
): IncidentRecord['severity'] => {
  const priority: Record<IncidentRecord['severity'], number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
    extreme: 5,
  };
  return [...severities].sort((left, right) => priority[right] - priority[left])[0] ?? 'low';
};
