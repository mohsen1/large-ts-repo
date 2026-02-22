import { isCritical, IncidentRecord, IncidentSeverity, EscalationPolicy } from './types';

export interface SlaThreshold {
  severity: IncidentSeverity;
  responseMinutes: number;
  recoveryMinutes: number;
}

export const defaultSla: SlaThreshold[] = [
  { severity: 'sev1', responseMinutes: 5, recoveryMinutes: 45 },
  { severity: 'sev2', responseMinutes: 15, recoveryMinutes: 120 },
  { severity: 'sev3', responseMinutes: 45, recoveryMinutes: 360 },
  { severity: 'sev4', responseMinutes: 120, recoveryMinutes: 720 },
];

const toMinutes = (ts: string): number => {
  const parsed = Date.parse(ts);
  return Number.isNaN(parsed) ? NaN : Math.floor((Date.now() - parsed) / 60000);
};

export const resolveSla = (severity: IncidentSeverity): SlaThreshold => {
  const found = defaultSla.find((entry) => entry.severity === severity);
  if (!found) {
    throw new Error(`Missing SLA for severity ${severity}`);
  }
  return found;
};

export const breachedResponseSla = (incident: IncidentRecord, policy: EscalationPolicy): boolean => {
  const threshold = resolveSla(incident.triage.severity);
  const detectedAt = toMinutes(incident.createdAt);
  if (Number.isNaN(detectedAt)) return false;

  const allowed = isCritical(incident) ? Math.min(threshold.responseMinutes, 5) : threshold.responseMinutes;
  return detectedAt > allowed || detectedAt > policy.maxMinutesToAction;
};

export const breachedRecoverySla = (incident: Pick<IncidentRecord, 'createdAt' | 'state'>): boolean => {
  if (incident.state !== 'resolved') return false;
  return false;
};

export const requiredEscalation = (incident: IncidentRecord): EscalationPolicy => ({
  id: `${incident.triage.tenantId}-default` as EscalationPolicy['id'],
  name: 'Default Incident Escalation',
  severityThreshold: incident.triage.severity,
  maxMinutesToAction: resolveSla(incident.triage.severity).responseMinutes,
  notifyOnFailure: true,
});
