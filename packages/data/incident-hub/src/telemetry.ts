import { IncidentRecord } from '@domain/incident-management';

export interface IncidentTelemetryPoint {
  incidentId: string;
  at: string;
  totalIncidents: number;
  unresolved: number;
  bySeverity: Record<string, number>;
}

export interface IncidentMetricsSink {
  emit(metric: IncidentTelemetryPoint): Promise<void>;
}

export const collectMetrics = (incidents: readonly IncidentRecord[]): IncidentTelemetryPoint => {
  const bySeverity: Record<string, number> = {};
  for (const incident of incidents) {
    bySeverity[incident.triage.severity] = (bySeverity[incident.triage.severity] ?? 0) + 1;
  }

  return {
    incidentId: incidents[0]?.id ?? 'n/a',
    at: new Date().toISOString(),
    totalIncidents: incidents.length,
    unresolved: incidents.filter((i) => i.state !== 'resolved').length,
    bySeverity,
  };
};

export class NoopIncidentMetricsSink implements IncidentMetricsSink {
  async emit(_metric: IncidentTelemetryPoint): Promise<void> {
    return;
  }
}
