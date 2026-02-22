import type {
  IncidentId,
  IncidentRecord,
  OrchestrationRun,
  IncidentPlan,
} from '@domain/recovery-incident-orchestration';
import type { IncidentQuery } from './types';

export interface TenantRunIndex {
  readonly tenantId: string;
  readonly incidentCount: number;
  readonly runCount: number;
  readonly openIncidentRatio: number;
}

export interface ServiceLoadIndex {
  readonly serviceName: string;
  readonly incidentCount: number;
  readonly averageSignals: number;
  readonly pendingRunRatio: number;
}

export interface IncidentSignalIndex {
  readonly incidentId: IncidentId;
  readonly topSignals: readonly string[];
  readonly signalDensity: number;
}

export const buildTenantRunIndex = (
  incidents: readonly IncidentRecord[],
  runs: readonly OrchestrationRun[],
): readonly TenantRunIndex[] => {
  const grouped = new Map<string, IncidentRecord[]>();
  for (const incident of incidents) {
    const tenantId = incident.scope.tenantId;
    grouped.set(tenantId, [...(grouped.get(tenantId) ?? []), incident]);
  }

  return Array.from(grouped.entries()).map(([tenantId, tenantIncidents]) => {
    const tenantIds = new Set(tenantIncidents.map((incident) => String(incident.id)));
    const runCount = runs.filter((run) => tenantIds.has(String(run.planId))).length;
    const openCount = tenantIncidents.filter((incident) => !incident.resolvedAt).length;
    return {
      tenantId,
      incidentCount: tenantIncidents.length,
      runCount,
      openIncidentRatio: normalize(openCount, tenantIncidents.length),
    };
  });
};

export const buildServiceLoadIndex = (
  incidents: readonly IncidentRecord[],
  plans: readonly IncidentPlan[],
): readonly ServiceLoadIndex[] => {
  const serviceLoad = new Map<string, IncidentRecord[]>();
  for (const incident of incidents) {
    const services = incident.scope.serviceName ?? 'unknown';
    const bucket = serviceLoad.get(services) ?? [];
    bucket.push(incident);
    serviceLoad.set(services, bucket);
  }

  const planByIncident = new Map<string, IncidentPlan[]>();
  for (const plan of plans) {
    const list = planByIncident.get(plan.incidentId) ?? [];
    list.push(plan);
    planByIncident.set(plan.incidentId, list);
  }

  return Array.from(serviceLoad.entries()).map(([serviceName, list]) => {
    const signals = list.reduce((sum, incident) => sum + incident.signals.length, 0);
    const planUsage = list.flatMap((incident) => planByIncident.get(incident.id) ?? []);
    const pendingRuns = planUsage.length === 0 ? 0 : list.filter((incident) => !incident.resolvedAt).length;
    return {
      serviceName,
      incidentCount: list.length,
      averageSignals: list.length === 0 ? 0 : Number((signals / list.length).toFixed(2)),
      pendingRunRatio: normalize(pendingRuns, Math.max(1, planUsage.length)),
    };
  });
};

export const buildIncidentSignalIndex = (
  incidents: readonly IncidentRecord[],
  query: IncidentQuery,
): readonly IncidentSignalIndex[] => {
  const matched = incidents.filter((incident) => {
    if (query.serviceName && incident.scope.serviceName !== query.serviceName) return false;
    if (query.severityGte && severityWeight(incident.severity) < query.severityGte) return false;
    return true;
  });

  return matched.map((incident) => {
    const topSignals = [...incident.signals]
      .sort((left, right) => right.value - left.value)
      .slice(0, 3)
      .map((signal) => `${signal.name}:${signal.value.toFixed(2)}`);
    return {
      incidentId: incident.id,
      topSignals,
      signalDensity: Number((incident.signals.length / Math.max(1, incident.snapshots.length)).toFixed(2)),
    };
  });
};

const normalize = (value: number, total: number): number => Number((value / Math.max(1, total)).toFixed(4));

const severityWeight = (severity: IncidentRecord['severity']): number => {
  if (severity === 'low') return 1;
  if (severity === 'medium') return 2;
  if (severity === 'high') return 3;
  if (severity === 'critical') return 4;
  return 5;
};
