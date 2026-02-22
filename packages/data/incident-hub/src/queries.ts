import { IncidentRecord } from '@domain/incident-management';
import { incidentAgeMinutes } from '@domain/incident-management';
import { IncidentRepository } from './store';

export interface IncidentSummary {
  incidentId: string;
  title: string;
  state: IncidentRecord['state'];
  ageMinutes: number;
  severity: IncidentRecord['triage']['severity'];
}

export const summarize = (incident: IncidentRecord): IncidentSummary => ({
  incidentId: incident.id,
  title: incident.title,
  state: incident.state,
  ageMinutes: incidentAgeMinutes(incident),
  severity: incident.triage.severity,
});

export const summarizeMany = (incidents: IncidentRecord[]): IncidentSummary[] => incidents.map(summarize);

export const highestPriority = (incidents: IncidentRecord[]): IncidentRecord[] => {
  return [...incidents].sort((left, right) => {
    if (left.triage.severity === right.triage.severity) {
      return Date.parse(left.updatedAt) - Date.parse(right.updatedAt);
    }
    return right.triage.severity.localeCompare(left.triage.severity);
  });
};

export const latestResolved = async (
  repo: IncidentRepository,
  tenantId: string,
  limit: number,
): Promise<IncidentSummary[]> => {
  const result = await repo.list({ tenantId, state: 'resolved', limit });
  if (!result.ok) return [];
  return summarizeMany(highestPriority(result.value));
};
