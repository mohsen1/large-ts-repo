import { z } from 'zod';
import { RecoveryIntent, evaluateRisk } from '@domain/recovery-cockpit-orchestration-core';
import { InMemoryIntentStore, IntentStore } from '@data/recovery-cockpit-intent-store';

export const policyInputSchema = z.object({
  maxActive: z.number().min(1).max(250),
  allowThrottle: z.boolean(),
  enforceManualReview: z.boolean(),
  criticalMode: z.boolean(),
});

export type PolicyConfig = z.infer<typeof policyInputSchema>;

export type PolicyDecision = Readonly<{
  intentId: string;
  action: 'approve' | 'queue' | 'reject' | 'escalate';
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}>;

export type PolicyDecisionEnvelope = Readonly<{
  timestamp: string;
  config: PolicyConfig;
  decisions: readonly PolicyDecision[];
}>;

const reasonOf = (severity: PolicyDecision['severity'], risk: number): string => {
  if (risk >= 90) return 'blocked by policy due to critical risk';
  if (risk >= 70) return 'throttle recommended';
  if (risk >= 45) return 'queue for staged execution';
  return severity === 'low' ? 'approved under normal policy' : 'requires operator signoff';
};

export const mapRiskToDecision = (risk: number, config: PolicyConfig, activeCount: number): PolicyDecision['action'] => {
  if (risk >= 88) return 'reject';
  if (risk >= 74 && config.enforceManualReview) return 'escalate';
  if (activeCount >= config.maxActive && config.allowThrottle) return 'queue';
  if (risk >= 60) return 'queue';
  return 'approve';
};

export const evaluatePolicy = async (
  store: IntentStore,
  config: PolicyConfig,
  intent: RecoveryIntent,
): Promise<PolicyDecision> => {
  const parsed = policyInputSchema.parse(config);
  const active = await store.listIntents({ status: 'active' });
  const activeCount = active.ok ? active.value.length : 0;
  const risk = evaluateRisk(intent);

  const severity: PolicyDecision['severity'] =
    risk.compositeScore >= 85 ? 'critical' : risk.compositeScore >= 70 ? 'high' : risk.compositeScore >= 50 ? 'medium' : 'low';

  const action = mapRiskToDecision(risk.compositeScore, parsed, activeCount);
  return {
    intentId: intent.intentId,
    action,
    reason: reasonOf(severity, risk.compositeScore),
    severity,
  };
};

export const evaluatePolicyBatch = async (
  store: InMemoryIntentStore,
  config: PolicyConfig,
): Promise<PolicyDecisionEnvelope> => {
  const intents = await store.listIntents();
  if (!intents.ok) {
    return {
      timestamp: new Date().toISOString(),
      config,
      decisions: [],
    };
  }

  const decisions = await Promise.all(
    intents.value.map((intent) =>
      evaluatePolicy(store, config, intent).then((decision) => ({
        ...decision,
        reason: decision.reason,
      })),
    ),
  );

  return {
    timestamp: new Date().toISOString(),
    config,
    decisions: decisions,
  };
};

export const annotateDecisions = (decisions: readonly PolicyDecision[]): string => {
  return decisions
    .map((decision) => `${decision.intentId}:${decision.action}/${decision.severity}`)
    .join(', ');
};

export const routeDecision = (decision: PolicyDecision): Promise<boolean> => {
  return Promise.resolve(decision.action === 'approve');
};
