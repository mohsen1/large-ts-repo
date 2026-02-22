import { Brand } from '@shared/core';

export type TenantId = Brand<string, 'TenantId'>;
export type IncidentId = Brand<string, 'IncidentId'>;
export type ServiceId = Brand<string, 'ServiceId'>;
export type OwnerId = Brand<string, 'OwnerId'>;
export type RunbookId = Brand<string, 'RunbookId'>;

export type IncidentSource = 'alert' | 'slo' | 'customer' | 'ops-auto' | 'security-posture';
export type IncidentSeverity = 'sev1' | 'sev2' | 'sev3' | 'sev4';
export type IncidentState = 'detected' | 'triaged' | 'mitigating' | 'monitoring' | 'resolved' | 'false-positive';
export type StepState = 'pending' | 'running' | 'done' | 'skipped' | 'failed';

export interface IncidentLabel {
  key: string;
  value: string;
}

export interface MetricSample {
  name: string;
  value: number;
  unit: 'count' | 'percent' | 'seconds' | 'ms';
  at: string;
}

export interface TriageContext {
  tenantId: TenantId;
  serviceId: ServiceId;
  observedAt: string;
  source: IncidentSource;
  severity: IncidentSeverity;
  labels: IncidentLabel[];
  confidence: number;
  signals: MetricSample[];
}

export interface MitigationAction<C = Record<string, unknown>> {
  key: string;
  description: string;
  owner?: OwnerId;
  requiresManualApproval: boolean;
  timeoutSeconds: number;
  config?: C;
}

export interface RunbookStep<C = Record<string, unknown>> {
  key: string;
  title: string;
  automation: 'safety' | 'rollback' | 'drain' | 'scale' | 'notify' | 'investigate';
  state: StepState;
  estimateSeconds: number;
  action: MitigationAction<C>;
  prerequisites: string[];
}

export interface Runbook<C = Record<string, unknown>> {
  id: RunbookId;
  tenantId: TenantId;
  name: string;
  owner: OwnerId;
  appliesTo: IncidentSeverity[];
  steps: RunbookStep<C>[];
  tags: string[];
}

export interface IncidentRecord<C = Record<string, unknown>> {
  id: IncidentId;
  tenantId: TenantId;
  serviceId: ServiceId;
  title: string;
  details: string;
  state: IncidentState;
  triage: TriageContext;
  runbook?: Runbook<C>;
  currentStep?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: C;
}

export interface FailureReport {
  incidentId: IncidentId | Brand<string, 'FailureReportIncidentId'>;
  tenantId: TenantId;
  title: string;
  severity: IncidentSeverity;
  source: string;
  status: 'active' | 'inactive' | IncidentState;
  createdAt: string;
  updatedAt: string;
  summary: Record<string, unknown>;
}

export interface EscalationPolicy {
  id: Brand<string, 'EscalationPolicyId'>;
  name: string;
  severityThreshold: IncidentSeverity;
  maxMinutesToAction: number;
  notifyOnFailure: boolean;
}

export interface TriageDecision {
  state: IncidentState;
  selectedRunbook?: RunbookId;
  escalation: EscalationPolicy;
  note: string;
}

export interface IncidentAuditEvent {
  incidentId: IncidentId;
  actor: OwnerId | 'system';
  action: string;
  details: string;
  occurredAt: string;
}

export const severityRank: Record<IncidentSeverity, number> = {
  sev1: 4,
  sev2: 3,
  sev3: 2,
  sev4: 1,
};

export const isCritical = (incident: Pick<IncidentRecord, 'triage'>): boolean =>
  severityRank[incident.triage.severity] >= 4;

export const isEscalating = (incident: Pick<IncidentRecord, 'state'>): boolean =>
  incident.state === 'triaged' || incident.state === 'mitigating';

export const normalizeTitle = (title: string): string => title.trim().toLowerCase().replace(/\s+/g, ' ');

export const incidentAgeMinutes = (incident: Pick<IncidentRecord, 'createdAt' | 'updatedAt'>, now = Date.now()): number => {
  const updated = Date.parse(incident.updatedAt);
  if (Number.isNaN(updated)) return 0;
  return Math.max(0, Math.floor((now - updated) / 60000));
};

export const escalateIf = (
  incident: Pick<IncidentRecord, 'triage'>,
  policy: EscalationPolicy,
): boolean => severityRank[incident.triage.severity] >= severityRank[policy.severityThreshold];
