import type { IncidentId, IncidentRecord, OrchestrationRun } from '@domain/recovery-incident-orchestration';
import type { RecoveryIncidentRepository } from '@data/recovery-incident-store';
import type { ServiceSnapshot, ServiceDependencies } from './types';

export interface ServiceState {
  readonly lastUpdatedAt: string;
  readonly totalIncidentCount: number;
  readonly activePlanCount: number;
  readonly recentRuns: readonly OrchestrationRun[];
  readonly tenantCounts: Readonly<Record<string, number>>;
}

const buildTenantCounts = (incidents: readonly IncidentRecord[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const incident of incidents) {
    const tenant = incident.scope.tenantId;
    counts[tenant] = (counts[tenant] ?? 0) + 1;
  }
  return counts;
};

export const summarizeServiceState = (incidents: readonly IncidentRecord[], runs: readonly OrchestrationRun[]): ServiceState => {
  const incidentCountByTenant = buildTenantCounts(incidents);
  const activePlanSet = new Set(incidents.map((incident) => incident.id));

  return {
    lastUpdatedAt: new Date().toISOString(),
    totalIncidentCount: incidents.length,
    activePlanCount: activePlanSet.size,
    recentRuns: runs.slice(-25),
    tenantCounts: incidentCountByTenant,
  };
};

export const buildTenantOverview = (tenantCounts: Readonly<Record<string, number>>): Array<{ tenantId: string; incidentCount: number }> => {
  return Object.entries(tenantCounts)
    .map(([tenantId, incidentCount]) => ({ tenantId, incidentCount }))
    .sort((left, right) => right.incidentCount - left.incidentCount);
};

export const loadStateFromRepository = async (
  repository: RecoveryIncidentRepository,
): Promise<{ state: ServiceState; incidents: readonly IncidentRecord[]; runs: readonly OrchestrationRun[] }> => {
  const incidents = (await repository.findIncidents({ limit: 1000 })).data;
  const runs = (await Promise.all(incidents.map((incident) => repository.getRuns(incident.id)))).flat();
  const state = summarizeServiceState(incidents, runs);

  return {
    state,
    incidents,
    runs,
  };
};

export const buildServiceSnapshotForIncident = (
  incidents: readonly IncidentRecord[],
  deps: ServiceDependencies,
): ServiceSnapshot => ({
  repositoryId: deps.repositoryId,
  auditTrail: incidents.map((incident) => ({
    eventId: `${deps.repositoryId}:${incident.id}:${incident.scope.tenantId}`,
    incidentId: String(incident.id),
    action: 'load',
    success: true,
    details: `severity=${incident.severity}`,
    occurredAt: incident.detectedAt,
  })),
  metrics: {
    planCount: incidents.length,
    runCount: incidents.reduce((sum, incident) => sum + incident.snapshots.length, 0),
    approvedCount: incidents.filter((incident) => incident.labels.includes('approved')).length,
    failedCount: incidents.filter((incident) => incident.labels.includes('failed')).length,
  },
});
