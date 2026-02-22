import type { Envelope } from '@shared/protocol';
import type {
  PolicyComplianceBundle,
  PolicyContextTags,
  PolicyDecision,
  PolicyEvaluationContext,
  PolicyResult,
  RecoveryPolicy,
  RecoveryPolicyEvaluation,
  RecoveryPolicyId,
} from '@domain/recovery-policy';

export interface PolicyEnvelope extends Envelope<RecoveryPolicy> {}

export interface PolicyDecisionEnvelope {
  readonly kind: 'policy-decision';
  readonly evaluatedAt: string;
  readonly tenant: string;
  readonly context: {
    runId: string;
    incidentId: string;
    tags: PolicyContextTags;
  };
  readonly evaluation: RecoveryPolicyEvaluation;
}

export interface PolicyAuditEntry {
  readonly policyId: RecoveryPolicyId;
  readonly policyName: RecoveryPolicy['name'];
  readonly runId: string;
  readonly result: PolicyResult;
  readonly reason: string;
  readonly severity: RecoveryPolicy['severity'];
  readonly effectCount: number;
  readonly appliedAt: string;
}

export interface RecoveryPolicyBundle extends PolicyComplianceBundle {
  readonly trace: RecoveryPolicyEvaluation;
  readonly evaluatedBy: string;
}

export interface PolicyDecisionContext {
  readonly policy: RecoveryPolicy;
  readonly programContext: PolicyEvaluationContext;
}

export interface PolicyArtifact {
  readonly decision: RecoveryPolicyEvaluation;
  readonly tags: PolicyContextTags;
  readonly tenant: string;
}
