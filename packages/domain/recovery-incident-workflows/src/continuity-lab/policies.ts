import type {
  ContinuityPolicy,
  ContinuityPolicyClause,
  ContinuityRiskBand,
  ContinuityRunContext,
  ContinuityRunResult,
  ContinuityTemplate,
  BuildPolicySummary,
} from './types';

export interface PolicyBudget {
  readonly maxRisk: number;
  readonly maxParallelism: number;
  readonly maxLatencyMs: number;
}

export type PolicyWindowHint<T extends ContinuityTemplate> = T extends { readonly nodes: readonly { readonly expectedLatencyMs: infer L }[] }
  ? L extends number
    ? `${L}ms`
    : never
  : never;

export const policyDefaults = {
  enforceSla: true,
  minReadiness: 0.42,
  maxParallelism: 4,
  clauses: [
    { name: 'latency', weight: 0.4, windowMinutes: 10 },
    { name: 'rollback', weight: 0.2, windowMinutes: 25 },
    { name: 'safety', weight: 0.4, windowMinutes: 30 },
  ],
  allowAsyncRollback: false,
} satisfies ContinuityPolicy;

export const inferRiskBand = (value: number): ContinuityRiskBand => {
  if (value >= 0.85) {
    return 'critical';
  }
  if (value >= 0.65) {
    return 'high';
  }
  if (value >= 0.35) {
    return 'medium';
  }
  return 'low';
};

const clamp = (value: number): number => Math.min(1, Math.max(0, value));
const normalize = (weight: number): number => clamp(weight * 100);

const clauseWeight = (clause: ContinuityPolicyClause): number => {
  const score = clause.windowMinutes === 0 ? 0 : normalize(clause.weight) / clause.windowMinutes;
  return clamp(score);
};

export const evaluatePolicy = (template: ContinuityTemplate): BuildPolicySummary => {
  const score = template.policy.clauses.length === 0
    ? 0
    : template.policy.clauses.reduce((acc, clause) => acc + clauseWeight(clause), 0) / template.policy.clauses.length;

  const allowed = template.nodes.length > 0 && template.policy.maxParallelism >= 1 && template.policy.enforceSla;
  const reasons = template.policy.clauses.length > 0
    ? ['policy-check-passed']
    : ['policy-check-empty'];

  return {
    allowed,
    reasons,
    score,
    riskBand: inferRiskBand(score),
  };
};

export const evaluateBudget = <T extends { readonly policy: ContinuityPolicy }>(context: T): PolicyBudget => {
  const weights = context.policy.clauses.length === 0
    ? [0]
    : context.policy.clauses.map((clause) => clause.weight);

  const maxRisk = weights.reduce((acc, value) => Math.max(acc, value), 0);
  const maxParallelism = context.policy.maxParallelism;
  const maxLatencyMs = context.policy.clauses.reduce((acc, clause) => acc + clause.windowMinutes, 0);

  return { maxRisk, maxParallelism, maxLatencyMs };
};

export const validateRun = (context: ContinuityRunContext, result: ContinuityRunResult): BuildPolicySummary => {
  const score = (result.success ? 1 : 0.2) * (result.output ? 0.6 : 0.2) + context.tags.length * 0.01;
  return {
    allowed: result.success,
    reasons: [
      `tenant=${context.tenant}`,
      `channel=${context.eventChannel}`,
      `node=${result.nodeId}`,
    ],
    score,
    riskBand: inferRiskBand(score),
  };
};

export const evaluateBundle = (
  templates: readonly ContinuityTemplate[],
  context: ContinuityRunContext,
): readonly BuildPolicySummary[] => templates.map((template) => {
  const base = evaluatePolicy(template);
  const budget = evaluateBudget(template);
  return {
    ...base,
    score: (base.score + budget.maxRisk + (1 / Math.max(1, budget.maxParallelism))) / 3,
    reasons: [
      ...base.reasons,
      `budget=${context.eventChannel}`,
      `latency=${budget.maxLatencyMs}`,
    ],
  };
});

export const evaluatePolicyWindow = <T extends readonly ContinuityTemplate[]>(
  ...templates: T
): T[number] extends infer Template
  ? Template extends ContinuityTemplate
    ? { readonly riskBand: ContinuityRiskBand; readonly budget: PolicyBudget; readonly policy: Template['policy'] }
    : never
  : never => {
  const first = templates[0];
  if (!first) {
    return {
      riskBand: 'low',
      budget: { maxRisk: 0, maxParallelism: 0, maxLatencyMs: 0 },
      policy: policyDefaults,
    } as never;
  }

  const budget = evaluateBudget(first);
  return {
    riskBand: inferRiskBand(evaluatePolicy(first).score),
    budget,
    policy: first.policy,
  } as never;
};
