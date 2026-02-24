import { z } from 'zod';
import { Brand } from '@shared/core';
import type { IncidentRecord, IncidentId, IncidentState, IncidentSeverity, TriageContext, FailureReport, StepState } from './types';

const brand = <B extends string>(value: string, _b: B): Brand<string, B> => value as Brand<string, B>;

const tenantIdSchema = z.string().transform((value) => brand(value, 'TenantId'));
const serviceIdSchema = z.string().transform((value) => brand(value, 'ServiceId'));
const ownerIdSchema = z.string().transform((value) => brand(value, 'OwnerId'));
const incidentIdSchema = z.string().transform((value) => brand(value, 'IncidentId'));
const severitySchema = z.enum(['sev1', 'sev2', 'sev3', 'sev4']);
const stateSchema = z.enum(['detected', 'triaged', 'mitigating', 'monitoring', 'resolved', 'false-positive']);
const sourceSchema = z.enum(['alert', 'slo', 'customer', 'ops-auto', 'security-posture']);
const unitSchema = z.enum(['count', 'percent', 'seconds', 'ms']);
const stepStateSchema = z.enum(['pending', 'running', 'done', 'skipped', 'failed']);
const runbookIdSchema = z.string().transform((value) => brand(value, 'RunbookId'));

const metricSchema = z.object({
  name: z.string(),
  value: z.number(),
  unit: unitSchema,
  at: z.string(),
});

const actionSchema = z.object({
  key: z.string(),
  description: z.string(),
  owner: ownerIdSchema.optional(),
  requiresManualApproval: z.boolean(),
  timeoutSeconds: z.number(),
  config: z.record(z.unknown()).optional(),
});

const stepSchema = z.object({
  key: z.string(),
  title: z.string(),
  automation: z.enum(['safety', 'rollback', 'drain', 'scale', 'notify', 'investigate']),
  state: stepStateSchema,
  estimateSeconds: z.number(),
  action: actionSchema,
  prerequisites: z.array(z.string()),
});

const runbookSchema = z.object({
  id: runbookIdSchema,
  tenantId: tenantIdSchema,
  name: z.string(),
  owner: ownerIdSchema,
  appliesTo: z.array(severitySchema),
  steps: z.array(stepSchema),
  tags: z.array(z.string()),
});

const triageSchema = z.object({
  tenantId: tenantIdSchema,
  serviceId: serviceIdSchema,
  observedAt: z.string(),
  source: sourceSchema,
  severity: severitySchema,
  labels: z.array(z.object({ key: z.string(), value: z.string() })),
  confidence: z.number(),
  signals: z.array(metricSchema),
});

const incidentSchema = z.object({
  id: incidentIdSchema,
  tenantId: tenantIdSchema,
  serviceId: serviceIdSchema,
  title: z.string(),
  details: z.string(),
  state: stateSchema,
  triage: triageSchema,
  runbook: runbookSchema.optional(),
  currentStep: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export const parseIncidentRecord = (input: unknown): IncidentRecord | undefined => {
  const parsed = incidentSchema.safeParse(input);
  if (!parsed.success) return undefined;
  return parsed.data as IncidentRecord;
};

const failureSeverity = z.union([severitySchema, z.enum(['low', 'moderate', 'high', 'critical'])]);

const failureSchema = z.object({
  incidentId: z.string().transform((value) => value as IncidentId),
  tenantId: tenantIdSchema,
  title: z.string(),
  severity: failureSeverity,
  source: z.string(),
  status: z.union([stateSchema, z.enum(['active', 'inactive'])]),
  createdAt: z.string(),
  updatedAt: z.string(),
  summary: z.record(z.unknown()),
});

export const parseFailureReport = (input: unknown): FailureReport | undefined => {
  const parsed = failureSchema.safeParse(input);
  if (!parsed.success) return undefined;
  return parsed.data as FailureReport;
};

export const normalizeState = (value: string): IncidentState | undefined =>
  stateSchema.safeParse(value).success ? (value as IncidentState) : undefined;

export const normalizeSeverity = (value: string): IncidentSeverity | undefined =>
  severitySchema.safeParse(value).success ? (value as IncidentSeverity) : undefined;

export const normalizeStepState = (value: string): StepState | undefined =>
  stepStateSchema.safeParse(value).success ? (value as StepState) : undefined;

export interface IncidentEnvelope {
  readonly source: string;
  readonly raw: unknown;
  readonly receivedAt: string;
}

export const normalizePayload = (envelope: IncidentEnvelope): IncidentRecord | undefined => {
  if (typeof envelope.raw === 'string') {
    try {
      return parseIncidentRecord(JSON.parse(envelope.raw));
    } catch {
      return undefined;
    }
  }
  return parseIncidentRecord(envelope.raw);
};

export const toDebugEnvelope = (incident: IncidentRecord): IncidentEnvelope => ({
  source: 'incident-management',
  raw: incident,
  receivedAt: new Date().toISOString(),
});

export interface ParsedTriageSignal {
  readonly tenantId: TriageContext['tenantId'];
  readonly serviceId: TriageContext['serviceId'];
  readonly confidence: number;
}

export const extractContext = (incident: IncidentRecord): ParsedTriageSignal => ({
  tenantId: incident.triage.tenantId,
  serviceId: incident.triage.serviceId,
  confidence: incident.triage.confidence,
});
