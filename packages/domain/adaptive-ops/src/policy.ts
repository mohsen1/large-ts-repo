import { SignalSample, AdaptivePolicy, AdaptiveAction, AdaptiveDecision, Runbook, IncidentId, SignalContext, PolicyId, asPolicyId } from './types';
import { z } from 'zod';

const actionSchema = z.object({
  type: z.enum(['scale-up', 'reroute', 'throttle', 'failover', 'notify']),
  intensity: z.number().min(0).max(1),
  targets: z.array(z.string().min(1)).min(1),
  justification: z.string().min(1),
});

export const policySchema = z.object({
  id: z.string().min(3),
  tenantId: z.string().min(1),
  name: z.string().min(1),
  active: z.boolean(),
  dependencies: z.array(
    z.object({
      serviceId: z.string().min(1),
      required: z.boolean(),
      resilienceBudget: z.number().nonnegative(),
    }),
  ),
  allowedSignalKinds: z.array(z.enum(['error-rate', 'latency', 'availability', 'cost-variance', 'manual-flag'])),
  window: z.object({
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    zone: z.string().min(1),
  }),
  driftProfile: z
    .object({
      dimensions: z.array(z.string()),
      expectedDirection: z.enum(['up', 'down']),
      threshold: z.number(),
      tolerance: z.number().min(0).max(1),
    })
    .optional(),
});

export type PolicyInput = z.infer<typeof policySchema>;

export const asPolicy = (input: PolicyInput): AdaptivePolicy => ({
  ...input,
  id: asPolicyId(input.id),
});

const classifyRisk = (score: number): AdaptiveDecision['risk'] => {
  if (score >= 0.8) return 'critical';
  if (score >= 0.55) return 'high';
  if (score >= 0.35) return 'medium';
  return 'low';
};

const buildAction = (kind: string, signal: SignalSample): AdaptiveAction => {
  const intensity = Math.min(1, Math.abs(signal.value - signal.value * 0.5));
  if (kind === 'error-rate') {
    return {
      type: 'scale-up',
      intensity,
      targets: [signal.kind as never],
      justification: `Error rate crossed threshold: ${signal.value}`,
    };
  }
  if (kind === 'latency') {
    return {
      type: 'reroute',
      intensity,
      targets: [signal.kind as never],
      justification: `Latency drift detected at ${signal.at}`,
    };
  }
  return {
    type: 'notify',
    intensity,
    targets: [signal.kind as never],
    justification: `Manual or cost signal: ${kind}`,
  };
};

export const evaluatePolicy = (
  policy: AdaptivePolicy,
  signals: readonly SignalSample[],
  context: SignalContext,
): AdaptiveDecision | null => {
  if (!policy.active) return null;
  const matchingSignals = signals.filter((sample) => policy.allowedSignalKinds.includes(sample.kind));
  if (matchingSignals.length === 0) return null;

  const score = matchingSignals.reduce((acc, sample) => {
    const normalized = sample.value / Math.max(1, policy.dependencies.length + 1);
    const threshold = policy.driftProfile?.threshold ?? 1;
    return acc + Math.min(1, normalized / threshold);
  }, 0);

  const finalScore = score / matchingSignals.length;
  const risk = classifyRisk(finalScore);
  const selectedActions = matchingSignals
    .map((signal) => buildAction(signal.kind, signal))
    .filter((action) => action.intensity > 0)
    .slice(0, 5);

  const runbook: Runbook = {
    id: `${context.services[0] ?? 'default'}-${Date.now()}` as any,
    owner: 'adaptive-ops-runtime',
    strategy: selectedActions,
    expectedRecoveryMinutes: Math.max(5, Math.round(30 * finalScore)),
    description: `Runbook synthesized for policy ${policy.name}`,
  };

  return {
    policyId: policy.id,
    incidentId: `${policy.tenantId}-${Date.now()}` as IncidentId,
    confidence: finalScore,
    selectedActions,
    risk,
    runbook,
  };
};

export const evaluatePolicies = (
  policies: readonly AdaptivePolicy[],
  signals: readonly SignalSample[],
  context: SignalContext,
): readonly AdaptiveDecision[] => {
  const decisions = policies
    .map((policy) => evaluatePolicy(policy, signals, context))
    .filter((value): value is AdaptiveDecision => value !== null);

  return decisions.sort((left, right) => right.confidence - left.confidence);
};
