import type { ControlPlaneConstraint, ControlPlaneGateInput, ConstraintResult, ConstraintEvaluator, ConstraintMap } from './types';

export interface PolicyDecision {
  readonly allowed: boolean;
  readonly reason: string;
  readonly appliedConstraints: readonly ConstraintResult[];
  readonly blockingCount: number;
  readonly warningCount: number;
}

const asConfidence = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
};

const evaluateLimitConstraint = (value: number, limit: number, mode: ControlPlaneConstraint['kind']): ConstraintResult => {
  const passed = mode === 'disabled' ? true : value <= limit;
  const warning = mode === 'strict'
    ? limit * 0.9
    : mode === 'monitor'
      ? limit * 1.1
      : limit;
  const isWarning = value > warning && !passed;
  return {
    name: 'limit',
    mode,
    passed,
    confidence: asConfidence(1 - Math.min(1, (value - limit) / Math.max(limit, 1))),
    details: passed
      ? `value ${value} within ${limit}`
      : isWarning
        ? `value ${value} exceeded warning threshold ${warning}`
        : `value ${value} exceeded limit ${limit}`,
  };
};

const buildContextDigest = (context: ControlPlaneGateInput): string => {
  return `${context.tenant}-${context.urgency}-${context.signals.length}`;
};

const evaluateSignalDensity = (
  context: ControlPlaneGateInput,
): ConstraintResult => {
  const value = context.signals.length;
  const constraint = context.constraints.find((item) => item.name === 'signal-density') ?? {
    name: 'signal-density',
    kind: 'strict',
    limit: 25,
  };
  const warning = constraint.warningThreshold ?? constraint.limit;
  const limit = context.urgency === 'reactive' ? constraint.limit : Math.max(1, warning);
  const passed = constraint.kind === 'disabled' ? true : value <= limit;
  return {
    name: constraint.name,
    mode: constraint.kind,
    passed,
    confidence: asConfidence(1 - Math.min(1, value / Math.max(limit, 1))),
    details: passed
      ? `signal density ${value}/${limit}`
      : `signal density ${value} over ${limit} for ${context.tenant}`,
  };
};

const evaluateConstraintMap = async (
  context: ControlPlaneGateInput,
  constraints: ConstraintMap<ControlPlaneGateInput, boolean>,
): Promise<ConstraintResult[]> => {
  const results: ConstraintResult[] = [];
  for (const [name, evaluator] of Object.entries(constraints)) {
    const constraint = context.constraints.find((item) => item.name === name);
    const mode = constraint?.kind ?? 'strict';
    if (mode === 'disabled') {
      results.push({
        name,
        mode,
        passed: true,
        confidence: 1,
        details: `${name} explicitly disabled`,
      });
      continue;
    }

    const passed = await Promise.resolve(evaluator(context));
    results.push({
      name,
      mode,
      passed,
      confidence: passed ? 1 : 0.35,
      details: passed ? `${name} accepted` : `${name} failed`,
    });
  }

  if (context.constraints.length === 0) {
    const builtIn = evaluateSignalDensity(context);
    results.push(builtIn);
  }

  return results;
};

const evaluateConstraint = (
  constraint: ControlPlaneConstraint,
  runSignals: number,
): ConstraintResult => {
  if (constraint.kind === 'disabled') {
    return {
      name: constraint.name,
      mode: 'disabled',
      passed: true,
      details: `${constraint.name} is disabled`,
      confidence: 1,
    };
  }

  return evaluateLimitConstraint(runSignals, constraint.limit, constraint.kind);
};

export const evaluateRunConstraints = async (
  context: ControlPlaneGateInput,
  dynamic: ConstraintMap<ControlPlaneGateInput, boolean> = {},
): Promise<PolicyDecision> => {
  const builtin = context.constraints.map((constraint) => evaluateConstraint(constraint, context.signals.length));
  const dynamicDecision = await evaluateConstraintMap(context, dynamic);

  const appliedConstraints = [...builtin, ...dynamicDecision];
  const blockingCount = appliedConstraints.reduce((acc, item) => acc + (item.passed ? 0 : 1), 0);
  const warningCount = appliedConstraints.reduce(
    (acc, item) => acc + (item.mode === 'monitor' && !item.passed ? 1 : 0),
    0,
  );
  const digest = buildContextDigest(context);

  const allowed = appliedConstraints.every((entry) => entry.passed || entry.mode === 'monitor');
  const messages = appliedConstraints.map((entry) => `${entry.name}:${entry.passed ? 'ok' : entry.mode}`);
  const reason = `${digest}|${messages.join(',')}`;

  return {
    allowed,
    reason,
    appliedConstraints,
    blockingCount,
    warningCount,
  };
};

export const buildConstraintMap = <TContext extends ControlPlaneGateInput>(
  evaluators: readonly ConstraintEvaluator<TContext, boolean>[],
): ConstraintMap<TContext, boolean> => {
  const map: ConstraintMap<TContext, boolean> = {};
  evaluators.forEach((evaluator, index) => {
    (map as Record<string, ConstraintEvaluator<TContext, boolean>>)[`policy-${index}`] = evaluator as ConstraintEvaluator<TContext, boolean>;
  });
  return map;
};

export const summarizePolicyDecision = (decision: PolicyDecision): string => {
  return `policy allowed=${decision.allowed}, blocks=${decision.blockingCount}, warnings=${decision.warningCount}`;
};
