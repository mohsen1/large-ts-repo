import { withBrand } from '@shared/core';
import { fail, ok, type Result } from '@shared/result';
import { evaluateRecoveryPolicy, type PolicyEvaluationOutcome, type PolicyContext } from '@domain/recovery-operations-governance';
import type {
  IncidentFingerprint,
  RecoverySignal,
  RecoveryOperationsEnvelope,
  RunSession,
} from '@domain/recovery-operations-models';
import type { RecoveryProgram } from '@domain/recovery-orchestration';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';
import type { RecoveryGovernanceRepository } from '@data/recovery-operations-governance-store';
import type { CompliancePublisher } from '@infrastructure/recovery-operations-compliance';

export interface PolicyDecision {
  readonly outcome: PolicyEvaluationOutcome;
  readonly decision: 'allow' | 'block';
  readonly reason: string;
}

export interface PolicyGateInput {
  readonly runId: RunSession['runId'];
  readonly sessionId: string;
  readonly tenant: string;
  readonly program: RecoveryProgram;
  readonly fingerprint: IncidentFingerprint;
  readonly readinessPlan: RecoveryReadinessPlan;
  readonly signals: readonly RecoverySignal[];
  readonly policyRepository: RecoveryGovernanceRepository;
  readonly publisher?: CompliancePublisher;
}

export interface PolicyGateContextInput {
  readonly runId: RunSession['runId'];
  readonly tenant: string;
  readonly runStatus?: string;
  readonly program: RecoveryProgram;
  readonly fingerprint: IncidentFingerprint;
  readonly readinessPlan: RecoveryReadinessPlan;
  readonly signals: readonly RecoverySignal[];
  readonly policyRepository: RecoveryGovernanceRepository;
  readonly publisher?: CompliancePublisher;
}

interface SessionPolicyEnvelope {
  readonly runId: string;
  readonly tenant: string;
  readonly policies: readonly string[];
}

export interface PolicyEngine {
  runChecks(input: PolicyGateInput): Promise<Result<PolicyDecision, string>>;
  runChecksFromContext(input: PolicyGateContextInput): Promise<Result<PolicyDecision, string>>;
  buildEnvelope(decision: PolicyDecision, tenant: string): RecoveryOperationsEnvelope<PolicyDecision>;
}

const evaluateSignalsDensity = (signals: readonly RecoverySignal[]): number => {
  const severity = signals.reduce((sum, item) => sum + item.severity, 0);
  return signals.length ? severity / (signals.length * 10) : 0;
}

export const createPolicyEngine = (): PolicyEngine => {
  return new RecoveryOperationsPolicyEngine();
};

export class RecoveryOperationsPolicyEngine implements PolicyEngine {
  async runChecks(input: PolicyGateInput): Promise<Result<PolicyDecision, string>> {
    const context: PolicyContext = {
      tenant: input.tenant,
      fingerprint: input.fingerprint,
      program: input.program,
      readinessPlan: input.readinessPlan,
      signals: input.signals,
    };

    const outcome = evaluateRecoveryPolicy(context);
    const signalDensity = evaluateSignalsDensity(input.signals);
    const policyRecord = {
      tenant: withBrand(input.tenant, 'TenantId'),
      runId: input.runId,
      policyId: outcome.metadata.policyId,
      evaluatedAt: outcome.assessedAt,
      blocked: outcome.blocked,
      score: outcome.score,
      findings: outcome.findings,
    };

    await input.policyRepository.upsertOutcome(policyRecord);

    if (outcome.blocked && signalDensity > 0.55) {
      await input.publisher?.publishPolicyOutcome(input.tenant, outcome);
      return fail('POLICY_BLOCKED');
    }

    return ok({
      outcome,
      decision: outcome.blocked ? 'block' : 'allow',
      reason: outcome.findings.length ? outcome.findings[0]?.message ?? 'policy_evaluated' : 'policy_allow',
    });
  }

  async runChecksFromContext(input: PolicyGateContextInput): Promise<Result<PolicyDecision, string>> {
    const runChecksInput: PolicyGateInput = {
      runId: input.runId,
      sessionId: `${input.tenant}-${String(input.runId)}`,
      tenant: input.tenant,
      program: input.program,
      fingerprint: input.fingerprint,
      readinessPlan: input.readinessPlan,
      signals: input.signals,
      policyRepository: input.policyRepository,
      publisher: input.publisher,
    };

    return this.runChecks(runChecksInput);
  }

  buildEnvelope(decision: PolicyDecision, tenant: string): RecoveryOperationsEnvelope<PolicyDecision> {
    return {
      eventId: `${tenant}-${Date.now()}`,
      tenant: withBrand(tenant, 'TenantId'),
      payload: decision,
      createdAt: new Date().toISOString(),
    };
  }
}

export const buildSessionPoliciesEnvelope = (policyIds: readonly string[], runId: string, tenant: string): SessionPolicyEnvelope => ({
  runId,
  tenant,
  policies: [...policyIds],
});
