import type { IncidentRecord, TenantId } from '@domain/incident-management';
import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import { withBrand } from '@shared/core';
import { InMemoryWorkspaceStore, IncidentWorkspaceRuntime, buildHealthCard } from '@data/incident-hub';
import { summarizePortfolio } from '@domain/incident-management';
import type { IncidentManagementSummary } from '../types';
import type { IncidentRepository } from '@data/incident-hub';

export interface IncidentManagementRuntime {
  hydrate(tenantId: TenantId): Promise<Result<{
    incidents: readonly IncidentRecord[];
    summary: IncidentManagementSummary;
    windows: readonly { at: string; score: number }[];
  }>>;
}

const calcSummary = (tenantId: string, incidents: readonly IncidentRecord[]): IncidentManagementSummary => {
  const tenant = withBrand(tenantId, 'TenantId');
  const totalOpen = incidents.filter(
    (incident) => incident.state !== 'resolved' && incident.state !== 'false-positive',
  ).length;
  const totalCritical = incidents.filter((incident) => incident.triage.severity === 'sev1').length;
  const health = buildHealthCard(tenantId, incidents);
  const alertCount = health.points.reduce((acc, point) => acc + point.open, 0);
  const lanes = summarizePortfolio({
    tenantId: tenant,
    generatedAt: health.generatedAt,
    cells: incidents.map((incident) => ({
      incidentId: incident.id,
      serviceId: incident.serviceId,
      severity: incident.triage.severity,
      state: incident.state,
      score: 0,
    })),
    total: incidents.length,
    activeCount: totalOpen,
    resolvedCount: incidents.length - totalOpen,
    avgSeverity: totalCritical,
    critical: totalCritical,
  });
  const avgReadiness = lanes.length
    ? Math.round(lanes.reduce((acc, lane) => acc + lane.score, 0) / lanes.length)
    : 100;

  return {
    tenantId: tenant,
    totalOpen,
    totalCritical,
    avgReadiness,
    alertCount,
  };
};

export const buildIncidentManagementRuntime = (
  repository: IncidentRepository,
): IncidentManagementRuntime => {
  const store = new InMemoryWorkspaceStore();
  const runtime = new IncidentWorkspaceRuntime(repository, store);

  return {
    async hydrate(tenantId) {
      const snapshot = await runtime.refresh(tenantId);
      if (!snapshot.ok) {
        return fail(snapshot.error, snapshot.code);
      }
      return ok({
        incidents: snapshot.value.incidents,
        summary: calcSummary(tenantId, snapshot.value.incidents),
        windows: snapshot.value.health.points.map((point) => ({ at: point.at, score: point.open })),
      });
    },
  };
};
