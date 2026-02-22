import type { RecoveryCheckpoint } from '@domain/recovery-orchestration';
import type { Brand } from '@shared/core';

import type {
  ConditionExpression,
  Operator,
  PolicyDecision,
  PolicyEvaluationContext,
  PolicyValue,
  RecoveryPolicy,
  RecoveryPolicyEvaluation,
} from './types';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const toStringArray = (value: unknown): readonly string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
};

const getPathValue = (context: PolicyEvaluationContext, path: string): PolicyValue => {
  const root: Record<string, unknown> = {
    program: context.program,
    run: context.run,
    checkpoint: context.checkpoint ?? null,
    window: context.window,
    tags: context.tags,
  };

  let current: unknown = root;

  for (const segment of path.split('.')) {
    if (!isObject(current)) return null;
    current = (current as Record<string, unknown>)[segment];
  }

  if (current === undefined) return null;
  return current as PolicyValue;
};

const compare = (operator: Operator, current: PolicyValue, expected: PolicyValue): boolean => {
  if (operator === 'exists') return current !== null && current !== undefined;

  if (operator === 'contains') {
    if (Array.isArray(current)) return toStringArray(current).includes(String(expected));
    return false;
  }

  if (operator === 'in') {
    if (Array.isArray(expected)) return toStringArray(expected).includes(String(current));
    return false;
  }

  if (operator === 'notIn') {
    if (Array.isArray(expected)) return !toStringArray(expected).includes(String(current));
    return true;
  }

  if (typeof current === 'number' && typeof expected === 'number') {
    switch (operator) {
      case 'eq': return current === expected;
      case 'ne': return current !== expected;
      case 'gt': return current > expected;
      case 'gte': return current >= expected;
      case 'lt': return current < expected;
      case 'lte': return current <= expected;
    }
  }

  if (Array.isArray(current) && Array.isArray(expected)) {
    return current.length === expected.length;
  }

  switch (operator) {
    case 'eq': return current === expected;
    case 'ne': return current !== expected;
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      const left = toNumber(current);
      const right = toNumber(expected);
      if (left === undefined || right === undefined) return false;
      if (operator === 'gt') return left > right;
      if (operator === 'gte') return left >= right;
      if (operator === 'lt') return left < right;
      return left <= right;
    default:
      return false;
  }
};

export const evaluateCondition = (condition: ConditionExpression, context: PolicyEvaluationContext): boolean => {
  if ('is' in condition) return condition.is;

  if ('not' in condition) {
    return !evaluateCondition(condition.not, context);
  }

  if ('all' in condition) {
    return condition.all.every((entry) => evaluateCondition(entry, context));
  }

  if ('any' in condition) {
    return condition.any.some((entry) => evaluateCondition(entry, context));
  }

  const current = getPathValue(context, condition.path);
  return compare(condition.operator, current, condition.value);
};

export const normalizePolicyDecision = (
  policy: RecoveryPolicy,
  context: PolicyEvaluationContext
): RecoveryPolicyEvaluation['blocking'][number] => {
  let score = 0;
  const triggered = [] as RecoveryPolicyEvaluation['blocking'][number]['effects'];
  const reasons = [] as string[];

  for (const rule of policy.rules) {
    const matches = evaluateCondition(rule.condition, context);
    if (!matches) continue;

    score += rule.weight;
    reasons.push(rule.label);
    for (const effect of rule.effects) {
      triggered.push({ ...effect });
    }
  }

  const result =
    triggered.length === 0 ? 'passed' : (policy.mode === 'blocking' ? 'blocked' : 'triggered');

  return {
    policyId: policy.id,
    policyName: policy.name,
    severity: policy.severity,
    result,
    reason: reasons.length ? reasons.join(' | ') : `${policy.name} not met`,
    effects: triggered,
    scoreDelta: score,
  };
};

export const normalizeRunWindowMinutes = (runStartedAt: string): number => {
  const start = Date.parse(runStartedAt);
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((Date.now() - start) / 60000));
};

export const buildEvaluationContext = (
  program: PolicyEvaluationContext['program'],
  run: PolicyEvaluationContext['run'],
  checkpoint: RecoveryCheckpoint | undefined
): PolicyEvaluationContext => ({
  program,
  run,
  checkpoint,
  window: {
    startedAt: run.startedAt ?? new Date().toISOString(),
    endedAt: run.completedAt,
    ageMinutes: normalizeRunWindowMinutes(run.startedAt ?? new Date().toISOString()),
  },
  tags: {
    tenant: run.incidentId.split(':')[0] ?? 'unknown',
    stepCount: run.currentStepId ? 1 : 0,
    runStatus: run.status,
  },
});

export const aggregateDecisions = (
  policyCount: number,
  decisions: readonly PolicyDecision[]
): RecoveryPolicyEvaluation => {
  const blocking = decisions.filter((decision) => decision.result === 'blocked');
  const advisory = decisions.filter((decision) => decision.result === 'triggered');
  const mitigations = decisions.filter((decision) => decision.effects.length > 0);
  const totalScore = decisions.reduce((total, decision) => total + decision.scoreDelta, 0);
  return {
    runId: decisions[0]?.policyId as unknown as string as Brand<string, 'RecoveryRunId'>,
    policyCount,
    blocking,
    advisory,
    mitigations,
    totalScore,
  };
};

export const pickTopEscalationRoutes = (decisions: readonly PolicyDecision[]): readonly string[] => {
  const routes = new Set<string>();
  for (const decision of decisions) {
    for (const effect of decision.effects) {
      if (effect.escalationRoute && effect.escalationRoute.trim()) {
        routes.add(effect.escalationRoute.trim());
      }
    }
  }
  return [...routes];
};

export const policyIsBlocking = (decisions: readonly PolicyDecision[]): boolean =>
  decisions.some((entry) => entry.result === 'blocked' && entry.effects.some((effect) => effect.action === 'abort'));
