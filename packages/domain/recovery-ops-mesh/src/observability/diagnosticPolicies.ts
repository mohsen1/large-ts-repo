import { z } from 'zod';
import { withBrand } from '@shared/core';
import type { Brand } from '@shared/core';
import { NoInfer } from '@shared/type-level';
import type {
  MeshSignalKind,
  MeshPayloadFor,
  MeshPlanId,
  MeshRunId,
} from '../types';
import type {
  MeshObservabilityAlert,
  ObservabilityRunContext,
  TopologyHealthProfile,
  HealthSignal,
} from './metrics';
export type PolicyName<T extends string> = `policy.${T}`;
export type PolicyId<T extends string> = Brand<string, `policy.${T}`>;

export type PolicyPredicate<T> = (value: T) => boolean;

export interface PolicyStep<TInput, TOutput = TInput> {
  readonly stage: `policy:${string}`;
  readonly when: {
    readonly label: PolicyName<string>;
    readonly test: PolicyPredicate<TInput>;
  };
  map(input: TInput): TOutput;
}

export type PolicyAction =
  | { readonly kind: 'alert'; readonly severity: HealthSignal['severity']; readonly reason: string }
  | { readonly kind: 'score'; readonly value: number; readonly reason: string }
  | { readonly kind: 'suppress'; readonly reason: string };

export interface PolicyDecision {
  readonly action: PolicyAction;
  readonly score: number;
  readonly context: Record<string, unknown>;
}

export interface PolicyResult {
  readonly policy: PolicyName<string>;
  readonly decisions: readonly PolicyDecision[];
  readonly fingerprint: Brand<string, 'mesh-policy-fingerprint'>;
}

export type PolicyPipeline<TState> = {
  readonly steps: readonly PolicyStep<TState, TState>[];
};

export type DecisionEnvelope<TInput, TOutput = TInput> = {
  readonly input: TInput;
  readonly output: TOutput;
  readonly decisions: readonly PolicyDecision[];
};

export type MergePolicies<TLeft, TRight> = {
  readonly [K in Exclude<keyof TLeft, keyof TRight>]: TLeft[K];
} & TRight;

export interface HealthPolicyConfig<TInputs extends MeshSignalKind[] = MeshSignalKind[]> {
  readonly id: PolicyId<'observability-policy'>;
  readonly namespace: string;
  readonly enabledSignals: NoInfer<TInputs>;
  readonly threshold: number;
}

export interface ObservabilityPolicyContext extends ObservabilityRunContext {
  readonly runId: MeshRunId;
  readonly planId: MeshPlanId;
  readonly profile: TopologyHealthProfile;
}

export interface PluginPolicy<TInput, TContext> {
  readonly id: PolicyId<string>;
  readonly name: PolicyName<string>;
  readonly accepts: (input: TInput, context: TContext) => boolean;
  readonly action: (input: TInput, context: TContext) => PolicyDecision;
}

export type DecisionReducer<TInput, TState = TInput> = (
  state: TState,
  decision: PolicyDecision,
) => DecisionReducerResult<TInput, TState>;

export type DecisionReducerResult<TInput, TState = TInput> = {
  readonly state: TState;
  readonly next: readonly PolicyDecision[];
  readonly input: TInput;
};

const policySchema = z.object({
  id: z.string().min(3),
  namespace: z.string().min(2),
  enabledSignals: z.array(z.string()),
  threshold: z.number().min(0).max(100),
});

export const parsePolicyConfig = (value: unknown): HealthPolicyConfig<MeshSignalKind[]> => {
  const parsed = policySchema.parse(value);

  return {
    id: withBrand(`policy.${parsed.id}`, 'policy.observability-policy'),
    namespace: parsed.namespace,
    enabledSignals: parsed.enabledSignals as MeshSignalKind[],
    threshold: parsed.threshold,
  };
};

const defaultActions: readonly PolicyAction[] = [
  { kind: 'score', value: 10, reason: 'stable' },
  { kind: 'suppress', reason: 'baseline' },
] as const satisfies readonly PolicyAction[];

export const buildDefaultPolicyPipeline = (inputs: readonly PolicyAction[]): PolicyPipeline<MeshObservabilityAlert> => {
  const steps = inputs.map<PolicyStep<MeshObservabilityAlert>>((action) => ({
    stage: `policy:${action.kind}`,
    when: {
      label: `policy.${action.kind}-matcher`,
      test: () => true,
    },
    map: (input) => ({
      ...input,
      title: `policy::${action.kind}::${input.title}`,
    }),
  }));

  return { steps };
};

export const policyPipeline = (policy: HealthPolicyConfig<MeshSignalKind[]>): PolicyPipeline<MeshObservabilityAlert> =>
  buildDefaultPolicyPipeline(defaultActions);

export const runPolicyPipeline = <TInput extends MeshObservabilityAlert>(
  pipeline: PolicyPipeline<TInput>,
  input: TInput,
): DecisionEnvelope<TInput> => {
  const decisions: PolicyDecision[] = [];
  let current = input;

  for (const step of pipeline.steps) {
    if (!step.when.test(current)) {
      continue;
    }
    current = step.map(current);
    decisions.push({
      action: {
        kind: 'score',
        value: 10,
        reason: `step:${step.stage}`,
      },
      score: 10,
      context: {
        stage: step.stage,
      },
    });
  }

  return {
    input,
    output: current,
    decisions,
  };
};

export const evaluatePolicyDecisions = (
  context: PolicyContext,
  decisions: readonly PolicyDecision[],
): Readonly<PolicyResult> => {
  const score = decisions.reduce((acc, decision) => {
    if (decision.action.kind === 'score') {
      return acc + decision.action.value;
    }
    if (decision.action.kind === 'alert') {
      return acc + 7;
    }
    return acc;
  }, 0);

  return {
    policy: `policy.${context.policyId}` as PolicyName<string>,
    decisions,
    fingerprint: withBrand(`policy-fingerprint-${context.runId}-${score}`, 'mesh-policy-fingerprint'),
  };
};

export interface PolicyContext {
  readonly runId: string;
  readonly policyId: string;
  readonly planId: string;
  readonly profile: TopologyHealthProfile;
  readonly signal: MeshPayloadFor<MeshSignalKind>;
  readonly window: number;
}

export const policySignalPath = <TSignal extends MeshSignalKind>(
  policyId: PolicyId<string>,
  signal: TSignal,
  profile: TopologyHealthProfile,
): `${PolicyId<string>}.${TSignal}.${number}` => {
  return `${policyId}.${signal}.${profile.cycleRisk}`;
};

export const extractDecisions = <T extends readonly PolicyDecision[]>(
  decisions: NoInfer<T>,
): readonly (T[number] & { readonly action: PolicyAction })[] => decisions;

export const rankDecision = (a: PolicyDecision, b: PolicyDecision): number => b.score - a.score;

export const topDecision = (decisions: readonly PolicyDecision[]): PolicyDecision | undefined => {
  const ordered = [...decisions].sort(rankDecision);
  return ordered[0];
};

export const combineDecisionContext = (
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): Record<string, unknown> => ({ ...left, ...right });
