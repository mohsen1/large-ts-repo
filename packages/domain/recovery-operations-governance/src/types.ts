import type { RecoveryProgram } from '@domain/recovery-orchestration';
import type { RecoveryReadinessPlan, ReadinessTarget } from '@domain/recovery-readiness';
import type { RecoverySignal, IncidentFingerprint } from '@domain/recovery-operations-models';
import type { DeepReadonly, Merge } from '@shared/type-level';

export type PolicySeverity = 'allow' | 'warn' | 'block';
export type PolicyPriority = 'low' | 'medium' | 'high' | 'critical';
export type PolicyScope = 'session' | 'plan' | 'fleet';

export interface PolicyMetadata {
  readonly policyId: string;
  readonly policyName: string;
  readonly ownerTeam: string;
  readonly updatedAt: string;
  readonly version: string;
}

export interface PolicyContext {
  readonly tenant: string;
  readonly fingerprint: IncidentFingerprint;
  readonly program: RecoveryProgram;
  readonly readinessPlan: RecoveryReadinessPlan;
  readonly signals: readonly RecoverySignal[];
}

export interface PolicyConstraint<TScope extends PolicyScope = PolicyScope> {
  readonly scope: TScope;
  readonly key: string;
  readonly value: string | number | boolean;
  readonly threshold?: number;
}

export interface PolicyRule<TScope extends PolicyScope = PolicyScope> {
  readonly id: string;
  readonly active: boolean;
  readonly priority: PolicyPriority;
  readonly severity: PolicySeverity;
  readonly reason: string;
  readonly constraint: PolicyConstraint<TScope>;
  readonly tags: readonly string[];
}

export interface TargetedRule {
  readonly rule: PolicyRule<'target'>;
  readonly targets: readonly ReadinessTarget[];
}

export interface PolicyEvaluationInput {
  readonly context: DeepReadonly<PolicyContext>;
  readonly applicableRules: readonly PolicyRule[];
}

export interface PolicyFinding<TScope extends PolicyScope = PolicyScope> {
  readonly ruleId: string;
  readonly scope: TScope;
  readonly severity: PolicySeverity;
  readonly matched: boolean;
  readonly message: string;
  readonly details: Record<string, unknown>;
}

export interface PolicyEvaluationOutcome {
  readonly tenant: string;
  readonly runId: string;
  readonly assessedAt: string;
  readonly metadata: PolicyMetadata;
  readonly signalsCount: number;
  readonly findings: readonly PolicyFinding[];
  readonly score: number;
  readonly blocked: boolean;
}

export type PolicyEvaluationAggregate = Merge<
  Pick<PolicyEvaluationOutcome, 'runId' | 'assessedAt' | 'blocked'>,
  {
    readonly riskBand: 'green' | 'amber' | 'red';
    readonly severityByScope: Record<PolicyScope, number>;
  }
>;
