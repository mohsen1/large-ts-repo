import { Runbook, RunbookStep, IncidentRecord, TriageDecision, IncidentSeverity, TenantId } from './types';
import { normalizeTitle } from './types';

export type StepSelector<R extends Record<string, unknown> = Record<string, unknown>> = (
  severity: IncidentSeverity,
) => readonly RunbookStep<R>[];

export interface RunbookFactory<R extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  tenantId: TenantId;
  severity: IncidentSeverity;
  build: StepSelector<R>;
}

export interface ExecutionPlan {
  runbook: Runbook;
  estimatedMinutes: number;
}

export const createRunbook = <R extends Record<string, unknown>>(input: {
  id: string;
  tenantId: TenantId;
  name: string;
  owner: string;
  severity: IncidentSeverity[];
  steps: RunbookStep<R>[];
  tags?: string[];
}): Runbook<R> => ({
  id: input.id as any,
  tenantId: input.tenantId,
  name: input.name,
  owner: input.owner as any,
  appliesTo: input.severity,
  steps: input.steps,
  tags: input.tags ?? [],
});

export const buildExecutionPlan = <R extends Record<string, unknown>>(
  candidates: Runbook<R>[],
  incident: IncidentRecord,
): ExecutionPlan | null => {
  const ordered = [...candidates]
    .filter((candidate) => candidate.appliesTo.includes(incident.triage.severity))
    .sort((a, b) => a.steps.length - b.steps.length);

  if (!ordered.length) return null;

  const chosen = ordered[0];
  const minutes = chosen.steps.reduce((sum, step) => sum + step.estimateSeconds, 0) / 60;

  return {
    runbook: {
      ...chosen,
      name: `${normalizeTitle(chosen.name)} ${incident.serviceId}`,
    },
    estimatedMinutes: Number(minutes.toFixed(2)),
  };
};

export const triageToDecision = <R extends Record<string, unknown>>(
  incident: IncidentRecord<R>,
  candidates: Runbook<R>[],
): TriageDecision => {
  if (!candidates.length) {
    return {
      state: 'triaged',
      note: 'No matching runbook found; continue manual investigation',
      escalation: {
        id: `${incident.id}-fallback` as any,
        name: 'Fallback escalation',
        severityThreshold: 'sev2',
        maxMinutesToAction: 60,
        notifyOnFailure: true,
      },
    };
  }

  return {
    state: 'mitigating',
    selectedRunbook: candidates[0]!.id,
    escalation: {
      id: `${incident.id}-policy` as any,
      name: 'Matched severity playbook',
      severityThreshold: incident.triage.severity,
      maxMinutesToAction: 30,
      notifyOnFailure: false,
    },
    note: 'Runbook assigned automatically from policy registry',
  };
};
