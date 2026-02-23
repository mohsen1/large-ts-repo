import { z } from 'zod';
import {
  IncidentRecord,
  EscalationPolicy,
  IncidentSeverity,
  Runbook,
  IncidentAuditEvent,
  IncidentId,
  OwnerId,
} from './types';
import { normalizeTitle, isCritical } from './types';
import { requiredEscalation, breachedResponseSla } from './sla';

const taskType = z.enum(['notify', 'remediate', 'verify', 'synthesize', 'communicate', 'close']);
const taskPriority = z.enum(['low', 'medium', 'high', 'urgent']);

export interface ResolutionTask<TMeta = Record<string, unknown>> {
  readonly id: string;
  readonly type: z.infer<typeof taskType>;
  readonly title: string;
  readonly owner: string;
  readonly risk: number;
  readonly requiredBy: string;
  readonly priority: z.infer<typeof taskPriority>;
  readonly metadata?: TMeta;
}

export interface ResolutionRunbook<C = Record<string, unknown>> {
  readonly incidentId: IncidentId;
  readonly scope: string;
  readonly createdAt: string;
  readonly tasks: readonly ResolutionTask<C>[];
  readonly confidence: number;
  readonly canAutoExecute: boolean;
}

export interface ResolutionState {
  readonly incidentId: string;
  readonly complete: number;
  readonly remaining: number;
  readonly riskScore: number;
  readonly blocked: boolean;
}

const estimateRisk = (
  severity: IncidentSeverity,
  critical: boolean,
  slaBreached: boolean,
  taskCount: number,
): number => {
  const base = severity === 'sev1' ? 85 : severity === 'sev2' ? 65 : 45;
  const adjusted = base + (critical ? 20 : 0) + (slaBreached ? 15 : 0) + Math.max(0, taskCount - 2) * 4;
  return Math.min(100, adjusted);
};

const buildTaskPriority = (
  index: number,
  total: number,
  policy: EscalationPolicy,
): z.infer<typeof taskPriority> => {
  if (policy.severityThreshold === 'sev1' || total - index >= 8) return 'urgent';
  if (policy.severityThreshold === 'sev2' || total - index >= 5) return 'high';
  if (total - index >= 2) return 'medium';
  return 'low';
};

const resolveOwner = (incident: IncidentRecord, index: number): string => {
  const fallback = index % 2 ? 'incident-ops' : 'recovery-ops';
  return `${incident.serviceId}-${fallback}`;
};

export const buildResolutionRunbook = (incident: IncidentRecord): ResolutionRunbook => {
  const policy: EscalationPolicy = requiredEscalation(incident);
  const slaBreached = breachedResponseSla(incident, policy);
  const runbook = incident.runbook as Runbook | undefined;
  const runbookSteps = runbook?.steps ?? [];

  const tasks = runbookSteps.map((step, index) => {
    const taskId = `${incident.id}:${step.key}`;
    const taskTypeValue = (step.automation === 'investigate'
      ? 'synthesize'
      : step.automation === 'notify'
        ? 'communicate'
        : step.automation === 'safety'
          ? 'verify'
          : 'remediate') as z.infer<typeof taskType>;

    return {
      id: taskId,
      type: taskTypeValue,
      title: `${normalizeTitle(step.title)} for ${incident.serviceId}`,
      owner: resolveOwner(incident, index),
      risk: Math.min(100, incident.triage.confidence * 100 + index * 5 + runbookSteps.length),
      requiredBy: step.prerequisites.join(',') || 'none',
      priority: buildTaskPriority(index, runbookSteps.length, policy),
      metadata: {
        automation: step.automation,
        estimateSeconds: step.estimateSeconds,
      },
    } satisfies ResolutionTask;
  });

  const totalRisk = estimateRisk(incident.triage.severity, isCritical(incident), slaBreached, tasks.length);
  const confidence = Number(((1 - incident.triage.confidence / 10) * (1 - totalRisk / 200)).toFixed(4));

  return {
    incidentId: incident.id,
    scope: incident.serviceId,
    createdAt: new Date().toISOString(),
    tasks,
    confidence: Number(Math.max(0, confidence).toFixed(3)),
    canAutoExecute: !slaBreached && tasks.length <= 6 && totalRisk < 82,
  };
};

export const buildResolutionSummary = (runbook: ResolutionRunbook): ResolutionState => {
  const complete = runbook.tasks.filter((task) => task.priority === 'low').length;
  const total = runbook.tasks.length;
  const riskScore = runbook.tasks.reduce((acc, task) => acc + task.risk, 0) / Math.max(1, total);

  return {
    incidentId: runbook.incidentId,
    complete,
    remaining: Math.max(0, total - complete),
    riskScore: Number(riskScore.toFixed(2)),
    blocked: !runbook.canAutoExecute,
  };
};

export const buildIncidentAuditTrail = (incident: IncidentRecord): IncidentAuditEvent[] => {
  const policy = requiredEscalation(incident);
  const events: IncidentAuditEvent[] = [];
  const now = new Date().toISOString();
  const runbook = buildResolutionRunbook(incident);

  events.push({
    incidentId: incident.id,
    actor: 'system',
    action: 'resolution-planned',
    details: `scope=${runbook.scope}, tasks=${runbook.tasks.length}, severity=${incident.triage.severity}`,
    occurredAt: now,
  });

  for (const task of runbook.tasks) {
  events.push({
    incidentId: incident.id,
    actor: task.owner as OwnerId,
    action: `task-${task.type}`,
    details: `${task.id}:${task.priority}`,
    occurredAt: now,
  });
  }

  if (policy.notifyOnFailure) {
    events.push({
      incidentId: incident.id,
      actor: 'system',
      action: 'notify',
      details: `notify=${policy.id}`,
      occurredAt: now,
    });
  }

  return events;
};

export const canAutoClose = (incident: IncidentRecord, runbook: ResolutionRunbook): boolean => {
  const summary = buildResolutionSummary(runbook);
  if (summary.blocked) return false;
  if (incident.state === 'resolved') return true;
  return summary.remaining <= 1 && summary.riskScore < 45;
};
