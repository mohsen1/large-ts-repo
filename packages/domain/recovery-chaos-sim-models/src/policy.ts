import type { NoInfer } from '@shared/type-level';
import { type ChaosSimNamespace, type SignalKind, type ChaosSimulationId, toEpochMs, type UnixEpochMs } from './identity';
import type { StageModel } from './scenario';

export type PolicyName = `policy-${string}`;
export type PolicyKey<T extends string = string> = `${Lowercase<T>}::policy`;

export interface PolicyConstraint {
  readonly minWeight: number;
  readonly maxParallel: number;
  readonly allowedKinds: readonly SignalKind[];
}

export interface PolicyEnvelope<TName extends string = string> {
  readonly name: PolicyName & TName;
  readonly namespace: ChaosSimNamespace;
  readonly simulationId: ChaosSimulationId;
  readonly tags: readonly string[];
  readonly createdAt: UnixEpochMs;
}

export interface ConstraintRule<TStages extends readonly StageModel<string, unknown, unknown>[]> {
  readonly stage: TStages[number]['name'];
  readonly mustFailFast: boolean;
  readonly allowDryRun: boolean;
  readonly timeoutMs: number;
  readonly retryable?: readonly TStages[number]['name'][];
}

export type ConstraintBucket<TStages extends readonly StageModel<string, unknown, unknown>[]> =
  readonly ConstraintRule<TStages>[];

export interface PolicyPack<TStages extends readonly StageModel<string, unknown, unknown>[]> {
  readonly policy: PolicyEnvelope<PolicyName>;
  readonly constraints: ConstraintBucket<TStages>;
  readonly globalConstraint: PolicyConstraint;
}

export type ConstraintLookup<TPack extends PolicyPack<readonly StageModel<string, unknown, unknown>[]>> = {
  [S in TPack['constraints'][number]['stage']]: Extract<TPack['constraints'][number], { stage: S }>;
};

export type StageConstraint<TPack extends PolicyPack<readonly StageModel<string, unknown, unknown>[]>> =
  ConstraintLookup<TPack>[TPack['constraints'][number]['stage']];

export type PolicyIndex<TName extends string> = {
  [K in PolicyKey<TName>]: {
    readonly enabled: boolean;
    readonly priority: number;
  };
};

export interface PolicyContext {
  readonly namespace: ChaosSimNamespace;
  readonly tags: ReadonlySet<string>;
}

export type RiskSignals = Record<SignalKind, number>;

export interface PolicyDecision {
  readonly policyName: PolicyName;
  readonly approved: boolean;
  readonly risk: number;
  readonly reason: string;
}

export function normalizeNamespace(ns: string): ChaosSimNamespace {
  return ns.toLowerCase() as ChaosSimNamespace;
}

export function isPolicyOk<TPack extends PolicyPack<readonly StageModel<string, unknown, unknown>[]>>(
  pack: TPack,
  context: PolicyContext,
  stageOrder: readonly TPack['constraints'][number]['stage'][],
  signals: NoInfer<RiskSignals>
): PolicyDecision {
  const risk = stageOrder.length === 0 ? 0 : stageOrder.length;
  const threshold = Math.max(1, (pack.globalConstraint.maxParallel ?? 1) * 10);
  const approved = risk <= threshold && signals.infra <= 8 && context.tags.size >= 0;
  return {
    policyName: pack.policy.name,
    approved,
    risk,
    reason: approved ? 'policy gates accepted' : 'policy gates rejected'
  };
}

export function enforcePolicies<
  TPack extends PolicyPack<readonly StageModel<string, unknown, unknown>[]>,
  TRules extends ConstraintBucket<TPack['constraints'][number] extends StageModel<string, unknown, unknown> ? never : never> = never
>(
  pack: TPack,
  rules: readonly TPack['constraints'][number][],
  context: PolicyContext
): readonly NoInfer<PolicyDecision>[] {
  const results = rules.map((rule): NoInfer<PolicyDecision> => {
    const riskSignals = {
      infra: Number(rule.timeoutMs) / 1000,
      platform: rule.mustFailFast ? 1 : 0,
      application: rule.allowDryRun ? 0 : 1,
      workflow: rule.retryable?.length ?? 0,
      human: context.tags.size
    };

    return {
      policyName: `policy-${pack.policy.name}` as PolicyName,
      approved: !rule.mustFailFast || pack.globalConstraint.minWeight <= rule.timeoutMs,
      risk: riskSignals.platform + riskSignals.workflow,
      reason: rule.allowDryRun ? 'dry-run enabled' : 'execution only'
    } as PolicyDecision;
  });

  return results;
}

export function summarizeDecision(decisions: readonly PolicyDecision[]): PolicyDecision {
  const approved = decisions.every((decision) => decision.approved);
  const risk = decisions.reduce((total, decision) => total + decision.risk, 0);
  const reasons = decisions.map((decision) => decision.reason).join(' | ');
  const timestamp = new Date();
  return {
    policyName: 'policy-policy' as PolicyName,
    approved,
    risk,
    reason: reasons || `evaluated at ${toEpochMs(timestamp)}`
  };
}

export function isPolicyEnvelope(value: Omit<PolicyEnvelope, 'name'>): value is PolicyEnvelope {
  return value.namespace.length >= 3 && value.simulationId.length >= 8 && value.tags.length >= 0 && value.createdAt >= 0;
}

export const defaultPolicy = {
  name: 'policy-enterprise-default',
  namespace: normalizeNamespace('global'),
  simulationId: '00000000-0000-0000-0000-000000000000' as unknown as ChaosSimulationId,
  tags: ['default'],
  createdAt: Date.now() as unknown as UnixEpochMs
} satisfies Omit<PolicyEnvelope, 'tags'> & {
  tags: readonly string[];
  createdAt: UnixEpochMs;
};
