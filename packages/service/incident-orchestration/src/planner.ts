import { IncidentRecord, buildExecutionPlan, triageToDecision, isCritical, createRunbook, Runbook, parseSeverity } from '@domain/incident-management';
import { summarizeMany, summarize } from '@data/incident-hub/queries';

export interface PlaybookTemplate {
  id: string;
  name: string;
  owner: string;
  severity: IncidentRecord['triage']['severity'];
  defaultSteps: number;
}

const fallbackTemplates = (): PlaybookTemplate[] => [
  {
    id: 'sev1-default',
    name: 'Critical Severity Playbook',
    owner: 'ops-team',
    severity: 'sev1',
    defaultSteps: 4,
  },
  {
    id: 'sev2-default',
    name: 'Degradation Playbook',
    owner: 'ops-team',
    severity: 'sev2',
    defaultSteps: 3,
  },
];

export const templateToRunbook = (tenantId: IncidentRecord['tenantId'], template: PlaybookTemplate): Runbook => {
  return createRunbook({
    id: template.id,
    tenantId,
    name: template.name,
    owner: template.owner,
    severity: [template.severity],
    steps: [...Array(template.defaultSteps)].map((_, index) => ({
      key: `step-${index + 1}`,
      title: `${template.name} step ${index + 1}`,
      automation: 'investigate',
      state: 'pending',
      estimateSeconds: 120,
      action: {
        key: `action-${index + 1}`,
        description: `Default remediation action ${index + 1}`,
        requiresManualApproval: isCritical({ triage: { severity: template.severity } as IncidentRecord['triage'] }),
        timeoutSeconds: 300,
      },
      prerequisites: index === 0 ? [] : [`step-${index}`],
    })),
    tags: [template.severity, isCritical({ triage: { severity: template.severity } as IncidentRecord['triage'] } ? 'critical' : 'routine'],
  });
};

export const selectTemplatesFor = (incident: IncidentRecord): PlaybookTemplate[] => {
  const severity = parseSeverity(incident.triage.severity);
  if (!severity) return [];

  return fallbackTemplates().filter((template) => template.severity === severity);
};

export const planForIncident = (incident: IncidentRecord): ReturnType<typeof buildExecutionPlan> => {
  const templates = selectTemplatesFor(incident);
  const runbooks = templates.map((template) => templateToRunbook(incident.tenantId, template));
  const plan = buildExecutionPlan(runbooks, incident);
  if (!plan) return null;

  return plan;
};

export const deriveDecision = (incident: IncidentRecord) => {
  const templates = selectTemplatesFor(incident);
  const runbooks = templates.map((template) => templateToRunbook(incident.tenantId, template));
  return triageToDecision(incident, runbooks);
};

export const summarizeIncident = (incident: IncidentRecord) => summarize(incident);
export const summarizeBatch = (incidents: IncidentRecord[]) => summarizeMany(incidents);
