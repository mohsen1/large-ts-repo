import {
  type IncidentContext,
  type IncidentIntentRecord,
  type IncidentIntentSignal,
  type IncidentIntentPolicy,
  type IncidentTenantId,
  type IncidentIntentStepOutput,
  createIncidentTenantId,
} from '@domain/recovery-incident-intent';
import { RecoveryIntentRecordRepository } from '@data/recovery-incident-intent-store';
import { createIntentStepId } from '@domain/recovery-incident-intent';

export interface OrchestratorInput {
  readonly tenantId: IncidentTenantId;
  readonly context: IncidentContext;
  readonly signals: readonly IncidentIntentSignal[];
  readonly policies: readonly IncidentIntentPolicy[];
}

export interface OrchestratorEnvelope {
  readonly tenant: IncidentTenantId;
  readonly record: IncidentIntentRecord;
  readonly policyMap: Readonly<Record<string, IncidentIntentPolicy>>;
}

interface RawPlan {
  readonly tenantId: string;
  readonly payload: string;
}

export const normalizeTenant = (tenant: string): IncidentTenantId => createIncidentTenantId(tenant.toLowerCase());

export const normalizeSignalsInput = (signals: readonly IncidentIntentSignal[]): readonly IncidentIntentSignal[] =>
  [...signals]
    .toSorted((left, right) => right.observedAt.localeCompare(left.observedAt))
    .map((signal) => ({
      ...signal,
      value: Number.isFinite(signal.value) ? signal.value : 0,
    }));

export const mapPolicyMap = (policies: readonly IncidentIntentPolicy[]): Record<string, IncidentIntentPolicy> => {
  return policies.reduce((acc, policy) => {
    acc[policy.policyId] = policy;
    return acc;
  }, {} as Record<string, IncidentIntentPolicy>);
};

export const asEnvelope = (record: IncidentIntentRecord, tenantId: IncidentTenantId): OrchestratorEnvelope => {
  const policies = record.context.tags.map((tag, index) => ({
    policyId: `${tenantId}:${tag}:${index}`,
    title: `${tag} baseline`,
    minimumConfidence: 0.5,
    weight: {
      severity: 1,
      freshness: 1,
      confidence: 1,
      cost: 0.5,
    },
    tags: [tag],
  }));

  return {
    tenant: tenantId,
    record,
    policyMap: mapPolicyMap(policies),
  };
};

export const parseRawPlan = (raw: RawPlan): OrchestratorInput => {
  const payload = raw.payload;
  return {
    tenantId: normalizeTenant(raw.tenantId),
    context: {
      tenantId: normalizeTenant(raw.tenantId),
      incidentId: `raw-${raw.tenantId}`,
      startedAt: new Date().toISOString(),
      affectedSystems: ['bootstrap'],
      severity: 'p4',
      tags: payload.split('|'),
      meta: {
        owner: 'orchestrator',
        region: 'global',
        team: 'recovery',
      },
    },
    signals: [],
    policies: [],
  };
};

export const attachPolicies = (
  input: OrchestratorInput,
  policies: readonly IncidentIntentPolicy[],
): OrchestratorInput => ({
  ...input,
  policies: [...input.policies, ...policies],
});

export const createRepoHandle = (): RecoveryIntentRecordRepository => new RecoveryIntentRecordRepository();

export const seedSignalOutput = (): IncidentIntentStepOutput[] => [
  {
    generatedAt: new Date().toISOString(),
    stepId: createIntentStepId('seed', 0),
    kind: 'collect',
    durationMs: 16,
    status: 'succeeded',
    output: 'seeded from adapter',
  },
];
