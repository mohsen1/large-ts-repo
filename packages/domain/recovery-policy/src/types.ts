import type { Brand } from '@shared/core';
import type { RecoveryCheckpoint, RecoveryRunState } from '@domain/recovery-orchestration';
import type { RecoveryProgram } from '@domain/recovery-orchestration';

export type RecoveryPolicyId = Brand<string, 'RecoveryPolicyId'>;
export type RecoveryPolicyVersion = `v${number}`;
export type RecoveryPolicySeverity = 'info' | 'warn' | 'error' | 'critical';
export type RecoveryPolicyMode = 'advisory' | 'mandatory' | 'blocking';
export type RecoveryAction = 'pause' | 'throttle' | 'retry' | 'escalate' | 'abort' | 'force-progress';

export interface PolicyContextTags {
  readonly [key: string]: string | number | boolean;
}

export interface RecoveryPolicyScope {
  tenant?: Brand<string, 'TenantId'>;
  services?: readonly Brand<string, 'ServiceId'>[];
  priorities?: readonly RecoveryRunState['status'][];
  programs?: readonly RecoveryProgram['id'][];
}

export type PrimitiveValue = string | number | boolean | null;
export type PolicyValue = PrimitiveValue | readonly PrimitiveValue[] | { readonly [key: string]: PrimitiveValue };

export type JsonFieldPath =
  | 'program.mode'
  | 'program.priority'
  | 'program.topology.rootServices'
  | 'program.topology.fallbackServices'
  | 'run.estimatedRecoveryTimeMinutes'
  | 'run.status'
  | 'run.currentStepId'
  | 'window.ageMinutes'
  | 'checkpoint.exitCode'
  | 'checkpoint.command'
  | 'checkpoint.details'
  | 'tags.errorRate';

export interface PathValue<TPath extends JsonFieldPath = JsonFieldPath> {
  readonly path: TPath;
  readonly value: PolicyValue;
}

export type Operator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'in'
  | 'notIn'
  | 'exists';

export interface ComparisonCondition {
  operator: Operator;
  path: JsonFieldPath;
  value: PolicyValue;
}

export interface NotCondition {
  not: ConditionExpression;
}

export interface AllCondition {
  all: ConditionExpression[];
}

export interface AnyCondition {
  any: ConditionExpression[];
}

export type ConditionExpression =
  | ComparisonCondition
  | NotCondition
  | AllCondition
  | AnyCondition
  | { is: boolean };

export interface PolicyEffect {
  action: RecoveryAction;
  reason: string;
  pauseMs?: number;
  maxRetries?: number;
  escalationRoute?: string;
}

export interface RecoveryPolicyRule {
  id: string;
  label: string;
  weight: number;
  condition: ConditionExpression;
  effects: readonly PolicyEffect[];
}

export type PolicyResult = 'passed' | 'triggered' | 'blocked';

export interface PolicyDecision {
  policyId: RecoveryPolicyId;
  policyName: string;
  severity: RecoveryPolicySeverity;
  result: PolicyResult;
  reason: string;
  effects: readonly PolicyEffect[];
  scoreDelta: number;
}

export interface RecoveryPolicy {
  id: RecoveryPolicyId;
  name: string;
  description: string;
  mode: RecoveryPolicyMode;
  severity: RecoveryPolicySeverity;
  version: RecoveryPolicyVersion;
  enabled: boolean;
  tags: readonly string[];
  scope: RecoveryPolicyScope;
  rules: readonly RecoveryPolicyRule[];
  owner: string;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyEvaluationContext {
  program: RecoveryProgram;
  run: RecoveryRunState;
  checkpoint?: RecoveryCheckpoint;
  window: {
    startedAt: string;
    endedAt?: string;
    ageMinutes: number;
  };
  tags: PolicyContextTags;
}

export interface RecoveryPolicyEvaluation {
  runId: RecoveryRunState['runId'];
  policyCount: number;
  blocking: readonly PolicyDecision[];
  advisory: readonly PolicyDecision[];
  mitigations: readonly PolicyDecision[];
  totalScore: number;
}

export interface PolicyDecisionEnvelope {
  evaluatedAt: string;
  context: {
    runId: RecoveryRunState['runId'];
    incidentId: RecoveryRunState['incidentId'];
  };
  evaluation: RecoveryPolicyEvaluation;
}

export type PolicyDecisionBuilder<TContext extends PolicyEvaluationContext = PolicyEvaluationContext> = (
  context: TContext,
) => Promise<RecoveryPolicyEvaluation>;

export type PolicyResultReducer = (
  decisions: readonly PolicyDecision[]
) => PolicyDecision | undefined;

export interface RecoveryPolicyRegistry {
  register(policy: RecoveryPolicy): void;
  unregister(policyId: RecoveryPolicyId): void;
  list(): readonly RecoveryPolicy[];
  forTenant(tenant: Brand<string, 'TenantId'>): readonly RecoveryPolicy[];
}

export interface PolicyComplianceBundle {
  decision: RecoveryPolicyEvaluation;
  blocked: boolean;
  requiredEscalations: readonly string[];
  throttleMs: number;
}
