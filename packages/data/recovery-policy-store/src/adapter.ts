import type { Envelope } from '@shared/protocol';

import type { RecoveryPolicy, PolicyComplianceBundle } from '@domain/recovery-policy';
import type { PolicyDecisionEnvelope, PolicyArtifact } from './models';
import { fail, ok } from '@shared/result';

export interface RecoveryPolicyAdapter {
  decodePolicy(envelope: Envelope<unknown>): Promise<RecoveryPolicy | null>;
  encodeDecision(bundle: PolicyComplianceBundle): PolicyDecisionEnvelope;
  emitArtifact(artifact: PolicyArtifact): Envelope<PolicyArtifact>;
}

export const decodePolicyEnvelope = async (
  envelope: Envelope<unknown>
): Promise<RecoveryPolicy | null> => {
  const payload = envelope.payload;
  if (
    payload &&
    typeof payload === 'object' &&
    'id' in payload &&
    'name' in payload &&
    'scope' in payload
  ) {
    return Promise.resolve(payload as RecoveryPolicy);
  }
  return Promise.resolve(null);
};

export const encodePolicyDecision = (bundle: PolicyComplianceBundle): PolicyDecisionEnvelope => ({
  kind: 'policy-decision',
  evaluatedAt: new Date().toISOString(),
  tenant: bundle.decision.trace.runId,
  context: {
    runId: bundle.decision.runId as string,
    incidentId: 'policy-engine',
    tags: {},
  },
  evaluation: bundle.decision,
});

export const emitPolicyArtifact = (artifact: PolicyArtifact): Envelope<PolicyArtifact> => ({
  id: `${artifact.tenant}:${artifact.runId}` as never,
  correlationId: `${Date.now()}` as never,
  timestamp: new Date().toISOString(),
  eventType: 'recovery.policy.artifact',
  payload: artifact,
});

export const policyAdapterResult = (payload: unknown) => {
  if (payload == null) return fail(new Error('payload missing'));
  return ok(payload);
};

export const policyAdapter: RecoveryPolicyAdapter = {
  decodePolicy: decodePolicyEnvelope,
  encodeDecision,
  emitArtifact,
};
