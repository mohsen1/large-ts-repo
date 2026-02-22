import type { IncidentId, IncidentRecord } from '@domain/recovery-incident-orchestration';
import type { IncidentPlanRecord } from './types';
import { buildSeverityForecast } from './incident-analytics';
import { buildAggregate } from './queries';
import type { CatalogSnapshot, PlaybookAssignment } from './playbook-catalog';

export interface PlaybookIncidentMetrics {
  readonly incidentId: IncidentId;
  readonly planCount: number;
  readonly runCount: number;
  readonly readinessRatio: number;
}

export interface PlaybookDashboardState {
  readonly totals: {
    readonly incidentCount: number;
    readonly planCount: number;
    readonly assignmentCount: number;
    readonly riskScore: number;
  };
  readonly topSignals: readonly {
    readonly tenantId: string;
    readonly value: number;
  }[];
  readonly incidents: readonly PlaybookIncidentMetrics[];
}

export interface NormalizedPlaybookAssignment {
  readonly incidentId: string;
  readonly ageMinutes: number;
  readonly templateId: string;
}

export const buildPlaybookDashboardState = (
  incidents: readonly IncidentRecord[],
  plans: readonly IncidentPlanRecord[],
  assignments: readonly PlaybookAssignment[],
): PlaybookDashboardState => {
  const aggregate = buildAggregate(incidents);
  const totalPlans = plans.length;
  const assignmentCount = assignments.length;
  const riskScore = buildSeverityForecast(incidents, incidents[0]?.scope.tenantId ?? 'global').predictedRisk;

  const counts = plans.reduce<Record<string, number>>((acc, planRecord) => {
    acc[String(planRecord.incidentId)] = (acc[String(planRecord.incidentId)] ?? 0) + 1;
    return acc;
  }, {});

  const incidentsWithRunState = Object.keys(aggregate.byTenant).flatMap((tenantId) => {
    const tenantIncidents = incidents.filter((incident) => incident.scope.tenantId === tenantId);
    return tenantIncidents.map((incident) => {
      const planCount = counts[String(incident.id)] ?? 0;
      const runCount = planCount * 3;
      const readinessRatio = runCount === 0 ? 0 : Number((planCount / Math.max(1, runCount)).toFixed(4));
      return {
        incidentId: incident.id,
        planCount,
        runCount,
        readinessRatio,
      };
    });
  });

  return {
    totals: {
      incidentCount: incidents.length,
      planCount: totalPlans,
      assignmentCount,
      riskScore,
    },
    topSignals: Object.entries(aggregate.byTenant)
      .map(([tenantId, value]) => ({
        tenantId,
        value: Number(value),
      }))
      .sort((left, right) => right.value - left.value)
      .slice(0, 10),
    incidents: incidentsWithRunState.sort((left, right) => right.readinessRatio - left.readinessRatio),
  };
};

export const selectAssignmentsByTenant = (
  catalog: CatalogSnapshot,
  tenantId: string,
): readonly PlaybookAssignment[] => catalog.assignments.filter((entry) => entry.operator.startsWith(tenantId));

export const summarizeAssignments = (
  assignments: readonly PlaybookAssignment[],
): {
  readonly total: number;
  readonly byIncident: readonly {
    readonly incidentId: IncidentId;
    readonly count: number;
  }[];
} => {
  const counts = new Map<string, number>();
  for (const assignment of assignments) {
    const next = (counts.get(String(assignment.incidentId)) ?? 0) + 1;
    counts.set(String(assignment.incidentId), next);
  }

  const byIncident = [...counts.entries()]
    .map(([incidentId, count]) => ({ incidentId: incidentId as IncidentId, count }))
    .sort((left, right) => right.count - left.count);

  return {
    total: assignments.length,
    byIncident,
  };
};

export const normalizeAssignments = (
  assignments: readonly PlaybookAssignment[],
): readonly NormalizedPlaybookAssignment[] =>
  assignments.map((assignment) => ({
    incidentId: String(assignment.incidentId),
    ageMinutes: Number(((Date.now() - Date.parse(assignment.assignedAt)) / 60_000).toFixed(2)),
    templateId: String(assignment.templateId),
  }));
