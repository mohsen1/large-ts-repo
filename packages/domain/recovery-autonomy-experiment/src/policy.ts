import type { NoInfer } from '@shared/type-level';
import type { ExperimentIntent, ExperimentPayload, ExperimentPlan, ExperimentPhase, ExperimentContext, ExperimentTag } from './types';

export type ConstraintPredicate<T> = (value: NoInfer<T>) => boolean;

export interface PolicyConstraint<T> {
  readonly id: string;
  readonly required: boolean;
  readonly predicate: ConstraintPredicate<T>;
}

export interface PolicyRule<TInput, TResult extends 'warn' | 'ok' = 'warn' | 'ok'> {
  readonly key: string;
  readonly level: TResult;
  readonly evaluate: (value: NoInfer<TInput>) => PolicyEvaluation;
}

export interface PolicyEvaluation {
  readonly allowed: boolean;
  readonly score: number;
  readonly details: readonly string[];
}

export interface Policy<TInput> {
  readonly id: string;
  readonly constraints: readonly PolicyConstraint<TInput>[];
  readonly rules: readonly PolicyRule<TInput>[];
}

export type PolicyResult<TInput> = TInput extends Policy<infer U> ? (value: NoInfer<U>) => PolicyEvaluation : never;

export type PolicyInput =
  | { readonly kind: 'intent'; readonly value: ExperimentIntent }
  | { readonly kind: 'payload'; readonly value: ExperimentPayload }
  | { readonly kind: 'context'; readonly value: ExperimentContext };

const buildDecision = (allowed: boolean, score = 0, details: readonly string[] = []): PolicyEvaluation => ({
  allowed,
  score,
  details,
});

const scoreByPhase = (value: NoInfer<ExperimentIntent>): number =>
  ['prepare', 'inject', 'observe', 'adapt', 'recover', 'verify'].indexOf(value.phase) + 1;

export const evaluatePolicy = <TInput>(policy: Policy<TInput>, input: NoInfer<TInput>): PolicyEvaluation => {
  const constraints = policy.constraints.reduce((acc, rule) => {
    const valid = rule.predicate(input);
    return acc + (valid ? 1 : -2);
  }, 0);

  const messages = policy.rules.flatMap((rule) => {
    const out = rule.evaluate(input);
    return out.details;
  });

  const warnings = policy.rules.filter((rule) => rule.level === 'warn').length;
  const penalty = warnings > 5 ? -5 : 0;

  return buildDecision(constraints >= 0, constraints + penalty, messages);
};

export const evaluatePolicySet = <TInput>(policies: readonly Policy<TInput>[], input: NoInfer<TInput>): PolicyEvaluation => {
  const evaluated = policies.map((policy) => evaluatePolicy(policy, input));
  const aggregated = evaluated.reduce(
    (acc, next) => ({
      allowed: acc.allowed && next.allowed,
      score: acc.score + next.score,
      details: [...acc.details, ...next.details],
    }),
    buildDecision(true, 0, [] as readonly string[]),
  );

  return aggregated;
};

const intentPolicy = (tenant: string): Policy<ExperimentIntent> => ({
  id: `intent:${tenant}`,
  constraints: [
    {
      id: 'intent-has-seed',
      required: true,
      predicate: (value) => value.seed.length > 6,
    },
    {
      id: 'intent-phase-valid',
      required: true,
      predicate: (value) => ['prepare', 'inject', 'observe', 'adapt', 'recover', 'verify'].includes(value.phase),
    },
  ],
  rules: [
    {
      key: 'intent-phase-index',
      level: 'ok',
      evaluate: (value) => buildDecision(true, scoreByPhase(value), [`phase:${value.phase}`]),
    },
  ],
});

const payloadPolicy = (tenant: string): Policy<ExperimentPayload> => ({
  id: `payload:${tenant}`,
  constraints: [
    {
      id: 'payload-horizon',
      required: true,
      predicate: (value) => value.horizonMinutes >= 1,
    },
  ],
  rules: [
    {
      key: 'payload-strategy',
      level: 'warn',
      evaluate: (value) =>
        buildDecision(value.strategy.length > 2, Math.min(10, value.strategy.length), [
          `strategy:${value.strategy.slice(0, 16)}`,
        ]),
    },
  ],
});

const contextPolicy = (tenant: string): Policy<ExperimentContext> => ({
  id: `context:${tenant}`,
  constraints: [
    {
      id: 'context-tenant',
      required: true,
      predicate: (value) => value.namespace.includes(tenant),
    },
  ],
  rules: [
    {
      key: 'context-signals',
      level: 'warn',
      evaluate: (value) => buildDecision(true, value.activePhases.length, [`signals:${value.activePhases.length}`]),
    },
  ],
});

export const evaluateIntentPolicy = (intent: ExperimentIntent): PolicyEvaluation =>
  evaluatePolicy(intentPolicy(intent.tenantId), intent);

export const evaluatePayloadPolicy = (payload: ExperimentPayload): PolicyEvaluation =>
  evaluatePolicy(payloadPolicy(payload.strategy), payload);

export const evaluateContextPolicy = (context: ExperimentContext): PolicyEvaluation =>
  evaluatePolicy(contextPolicy(context.tenantId), context);

export const resolveTag = (prefix: string, label: ExperimentTag<string>): string =>
  `${prefix}:${label}`;

export const mergePolicyResults = (...results: readonly PolicyEvaluation[]): PolicyEvaluation =>
  results.reduce(
    (acc, result) => ({
      allowed: acc.allowed && result.allowed,
      score: acc.score + result.score,
      details: [...acc.details, ...result.details],
    }),
    buildDecision(true, 0, [] as readonly string[]),
  );

export const auditPolicyInput = (input: PolicyInput): string => {
  switch (input.kind) {
    case 'intent':
      return `intent:${input.value.phase}:${input.value.source}`;
    case 'payload':
      return `payload:${input.value.strategy}`;
    case 'context':
      return `context:${input.value.namespace}`;
    default:
      return 'policy:unknown';
  }
};
