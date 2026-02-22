import type { IncidentId, IncidentRecord, IncidentPlan, OrchestrationRun, IncidentEvent } from '@domain/recovery-incident-orchestration';
import type { IncidentPlanRecord, IncidentRunRecord, IncidentStoreEvent } from './types';
import { latestEventOfType } from './events';

export interface IncidentQueryShape {
  readonly tenantId?: string;
  readonly serviceName?: string;
  readonly severity?: readonly IncidentRecord['severity'][];
  readonly minSignals?: number;
}

export interface IncidentRollup {
  readonly incidentId: IncidentId;
  readonly planCount: number;
  readonly runCount: number;
  readonly latestEvent?: IncidentStoreEvent['type'];
  readonly latestUpdate?: string;
}

export interface IncidentAggregate {
  readonly totalSignals: number;
  readonly byTenant: Record<string, number>;
  readonly bySeverity: Record<IncidentRecord['severity'], number>;
}

export const matchIncident = (incident: IncidentRecord, query: IncidentQueryShape): boolean => {
  if (query.tenantId && incident.scope.tenantId !== query.tenantId) {
    return false;
  }
  if (query.serviceName && incident.scope.serviceName !== query.serviceName) {
    return false;
  }
  if (query.severity && query.severity.length > 0 && !query.severity.includes(incident.severity)) {
    return false;
  }
  if (query.minSignals !== undefined && incident.signals.length < query.minSignals) {
    return false;
  }
  return true;
};

export const buildIncidentRollups = (
  incidents: readonly IncidentRecord[],
  plans: readonly IncidentPlanRecord[],
  runs: readonly IncidentRunRecord[],
  events: readonly IncidentStoreEvent[],
): readonly IncidentRollup[] => {
  const planByIncident = new Map<string, IncidentPlanRecord[]>();
  for (const plan of plans) {
    const key = String(plan.incidentId);
    const bucket = planByIncident.get(key) ?? [];
    bucket.push(plan);
    planByIncident.set(key, bucket);
  }

  const runByIncident: Record<string, number> = {};
  for (const run of runs) {
    runByIncident[String(run.planId)] = (runByIncident[String(run.planId)] ?? 0) + 1;
  }

  return incidents.map((incident) => {
    const incidentPlans = planByIncident.get(String(incident.id)) ?? [];
    const planIds = new Set(incidentPlans.map((entry) => String(entry.id)));
    const runCount = [...planIds].reduce((sum, planId) => sum + (runByIncident[planId] ?? 0), 0);
    const relevantEvents = events.filter((entry) => String(entry.incidentId) === String(incident.id));
    const latest = latestEventOfType(relevantEvents, 'updated') ?? latestEventOfType(relevantEvents, 'plan_added');

    return {
      incidentId: incident.id,
      planCount: incidentPlans.length,
      runCount,
      latestEvent: latest?.type,
      latestUpdate: latest?.emittedAt,
    };
  });
};

export const buildAggregate = (incidents: readonly IncidentRecord[]): IncidentAggregate => {
  let totalSignals = 0;
  const byTenant: Record<string, number> = {};
  const bySeverity: Record<IncidentRecord['severity'], number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
    extreme: 0,
  };

  for (const incident of incidents) {
    totalSignals += incident.signals.length;
    byTenant[incident.scope.tenantId] = (byTenant[incident.scope.tenantId] ?? 0) + 1;
    bySeverity[incident.severity] += 1;
  }

  return { totalSignals, byTenant, bySeverity };
};

export const recentRollups = (
  rollups: readonly IncidentRollup[],
  threshold: number,
): readonly IncidentRollup[] =>
  rollups
    .filter((entry) => (entry.runCount ?? 0) >= threshold)
    .sort((a, b) => (b.runCount ?? 0) - (a.runCount ?? 0));

export const toPlanMap = (plans: readonly IncidentPlan[]): Map<IncidentId, IncidentPlan> => {
  const map = new Map<IncidentId, IncidentPlan>();
  for (const plan of plans) {
    map.set(plan.incidentId, plan);
  }
  return map;
};

export const eventsByIncident = (events: readonly IncidentStoreEvent[], incidentId: IncidentId): readonly IncidentStoreEvent[] =>
  events.filter((entry) => String(entry.incidentId) === String(incidentId));

export const countTerminalEvents = (events: readonly IncidentStoreEvent[], incidentId: IncidentId): number => {
  const set = new Set<IncidentStoreEvent['type']>(['resolved', 'escalated']);
  return eventsByIncident(events, incidentId).filter((entry) => set.has(entry.type)).length;
};
