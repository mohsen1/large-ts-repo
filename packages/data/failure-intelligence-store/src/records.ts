import { z } from 'zod';
import { type IncidentFingerprint, type FailureActionPlan, type FailureSignal, type NewFailureSignal, createSignalIdentity } from '@domain/failure-intelligence';
import { normalizeSignal, normalizePlan } from '@domain/failure-intelligence/src/schema';
import { type FailureReport, type IncidentState } from '@domain/incident-management';
import { Brand } from '@shared/core';

export const IncidentSeveritySchema = z.enum(['low', 'moderate', 'high', 'critical']);

export interface SignalEnvelope {
  signal: FailureSignal;
  capturedAt: string;
}

export interface PlanEnvelope {
  plan: FailureActionPlan;
  recordedAt: string;
}

export interface FailureKnowledgeRecord {
  id: Brand<string, 'FailureKnowledgeId'>;
  tenantId: Brand<string, 'TenantId'>;
  fingerprint: IncidentFingerprint;
  state: IncidentState;
  report: FailureReport;
  updatedAt: string;
}

export interface FailureStoreState {
  readonly signals: readonly SignalEnvelope[];
  readonly plans: readonly PlanEnvelope[];
  readonly reports: readonly FailureKnowledgeRecord[];
}

export const normalizeIncomingSignal = (input: unknown): FailureSignal | undefined => {
  return normalizeSignal(input);
};

export const normalizeIncomingPlan = (input: unknown): FailureActionPlan | undefined => {
  return normalizePlan(input);
};

export const toSignalEnvelope = (input: NewFailureSignal | FailureSignal): SignalEnvelope => {
  const signal: FailureSignal = normalizeSignal(input) ?? input;
  return { signal, capturedAt: new Date().toISOString() };
};

export const toPlanEnvelope = (plan: FailureActionPlan): PlanEnvelope => ({
  plan,
  recordedAt: new Date().toISOString(),
});

export const makeRecordFromPlan = (plan: FailureActionPlan): FailureKnowledgeRecord => {
  return {
    id: `${plan.id}:record` as Brand<string, 'FailureKnowledgeId'>,
    tenantId: plan.tenantId,
    fingerprint: plan.fingerprint,
    state: 'open',
    report: {
      incidentId: `${plan.id}:incident`,
      tenantId: String(plan.tenantId),
      title: `Failure action plan ${plan.id}`,
      severity: IncidentSeveritySchema.parse(plan.fingerprint.severity),
      source: 'failure-intelligence-runner',
      status: 'active',
      createdAt: plan.createdAt,
      updatedAt: plan.expiresAt,
      summary: {
        openSignals: plan.signalIds.length,
        owner: plan.owner ?? 'unassigned',
      },
    },
    updatedAt: new Date().toISOString(),
  };
};
