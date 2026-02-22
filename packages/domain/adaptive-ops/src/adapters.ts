import { z } from 'zod';
import { AdaptiveDecision, AdaptiveAction, AdaptivePolicy, SignalSample, PolicyId, SignalKind, AdaptiveRun } from './types';

export interface AdapterRunnerContext {
  tenantId: string;
  signalWindowSec: number;
  policies: readonly AdaptivePolicy[];
}

export interface AdapterRunnerInput {
  context: AdapterRunnerContext;
  signals: readonly SignalSample[];
}

const fallbackPolicy = (tenantId: string): AdaptivePolicy => ({
  id: tenantId as PolicyId,
  tenantId: tenantId as never,
  name: 'fallback-policy',
  active: false,
  dependencies: [],
  window: {
    startsAt: new Date().toISOString(),
    endsAt: new Date().toISOString(),
    zone: 'utc',
  },
  allowedSignalKinds: ['manual-flag'],
});

export interface PolicyEnvelope {
  rawPolicyId: string;
  tenantId: string;
  name: string;
  active: boolean;
  dependencies: readonly string[];
  allowedSignalKinds: readonly SignalKind[];
}

const policyAdapterSchema = z.object({
  rawPolicyId: z.string().min(1),
  tenantId: z.string().min(1),
  name: z.string().min(1),
  active: z.boolean(),
  dependencies: z.array(z.string().min(1)),
  allowedSignalKinds: z.array(z.enum(['error-rate', 'latency', 'availability', 'cost-variance', 'manual-flag'])),
});

export type PolicyEnvelopeInput = z.infer<typeof policyAdapterSchema>;

export const adaptPolicyEnvelope = (payload: PolicyEnvelopeInput): PolicyEnvelope => policyAdapterSchema.parse(payload);

export const toPolicy = (payload: PolicyEnvelope): AdaptivePolicy => ({
  id: payload.rawPolicyId as PolicyId,
  tenantId: payload.tenantId as never,
  name: payload.name,
  active: payload.active,
  dependencies: payload.dependencies.map((serviceId) => ({
    serviceId: serviceId as AdaptivePolicy['dependencies'][number]['serviceId'],
    required: true,
    resilienceBudget: 1,
  })),
  window: {
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    zone: 'utc',
  },
  allowedSignalKinds: payload.allowedSignalKinds,
});

export const buildSignalSample = (row: { kind: string; value: number; at: string }): SignalSample | null => {
  if (!isSignalKind(row.kind) || Number.isNaN(row.value)) return null;
  return {
    kind: row.kind,
    value: row.value,
    unit: 'score',
    at: row.at,
  };
};

export const buildRunnerContext = (tenantId: string, policies: readonly AdaptivePolicy[], windowSec: number): AdapterRunnerContext => ({
  tenantId,
  signalWindowSec: windowSec,
  policies,
});

export const buildRunnerInput = (tenantId: string, policies: readonly AdaptivePolicy[], signals: readonly SignalSample[]): AdapterRunnerInput => {
  return {
    context: buildRunnerContext(tenantId, policies, 300),
    signals,
  };
};

export const toSignalContext = (run: AdaptiveRun, policies: readonly AdaptivePolicy[]) => ({
  tenantId: run.policyId as never,
  services: policies.flatMap((policy) => policy.dependencies.map((dependency) => dependency.serviceId)),
  window: {
    startsAt: run.serviceWindow.startsAt,
    endsAt: run.serviceWindow.endsAt,
    zone: run.serviceWindow.zone,
  },
});

export const ensurePolicy = (policies: readonly AdaptivePolicy[], policyId: PolicyId | string): AdaptivePolicy => {
  return policies.find((policy) => policy.id === policyId) ?? fallbackPolicy(`${policyId}`);
};

export const isSignalKind = (value: string): value is SignalKind => {
  return ['error-rate', 'latency', 'availability', 'cost-variance', 'manual-flag'].includes(value);
};

export interface PolicyRepository {
  fetchByTenant(tenantId: string): Promise<readonly PolicyEnvelope[]>;
}

export const toAdaptationPayload = (
  tenantId: string,
  policies: readonly PolicyEnvelope[],
  rawSignals: readonly { kind: string; value: number; at: string }[],
): { context: AdapterRunnerContext; signals: SignalSample[] } => {
  const adaptedPolicies = policies.filter((policy) => policy.tenantId === tenantId).map(toPolicy);
  const signals = rawSignals.map(buildSignalSample).filter((sample): sample is SignalSample => sample !== null);
  return {
    context: buildRunnerContext(tenantId, adaptedPolicies, 300),
    signals,
  };
};

export const flattenDecisions = (decisions: readonly AdaptiveDecision[]): readonly AdaptiveAction[] => {
  return decisions.flatMap((decision) => decision.selectedActions);
};
