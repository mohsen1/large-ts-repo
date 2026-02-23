import type { PlaybookBlueprint, PlaybookStepTemplate, PlaybookStepId, RiskTier, Severity } from './types';

export interface ConstraintContext {
  readonly service: string;
  readonly timeBudgetMinutes: number;
  readonly activeWorkload: number;
  readonly riskTier: RiskTier;
}

export interface ConstraintViolation {
  readonly key: string;
  readonly message: string;
  readonly severity: 'warn' | 'error' | 'info';
}

const severityWeight: Record<Severity, number> = {
  minor: 1,
  major: 2,
  catastrophic: 3,
};

const maxConcurrencyByTier: Record<RiskTier, number> = {
  none: 8,
  low: 6,
  medium: 4,
  high: 2,
  critical: 1,
};

const budgetByKind: Record<string, number> = {
  assess: 1,
  notify: 1,
  isolate: 2,
  restore: 3,
  verify: 1,
  postmortem: 1,
};

const riskMultiplierByKind: Record<string, number> = {
  assess: 0.8,
  notify: 0.5,
  isolate: 1.6,
  restore: 1.9,
  verify: 0.9,
  postmortem: 0.4,
};

const tierRiskBudget: Record<RiskTier, number> = {
  none: 90,
  low: 80,
  medium: 70,
  high: 60,
  critical: 50,
};

const toTierIndex = (tier: RiskTier): Severity => {
  if (tier === 'critical') {
    return 'catastrophic';
  }
  if (tier === 'high') {
    return 'major';
  }
  return 'minor';
};

export const canStepRunWithContext = (
  step: PlaybookStepTemplate,
  context: ConstraintContext,
): { ok: boolean; violations: readonly ConstraintViolation[] } => {
  const violations: ConstraintViolation[] = [];

  const tolerance = tierRiskBudget[context.riskTier];
  const projectedMinutes = step.expectedLatencyMinutes * riskMultiplierByKind[step.kind];
  const capacity = maxConcurrencyByTier[context.riskTier] * budgetByKind[step.kind];

  if (projectedMinutes > tolerance) {
    violations.push({
      key: 'time-budget-exceeded',
      message: `Step ${step.id} projected latency ${projectedMinutes} exceeds tier budget ${tolerance}`,
      severity: 'warn',
    });
  }

  if (step.automationLevel > capacity) {
    violations.push({
      key: 'automation-capacity',
      message: `Step ${step.id} automation ${step.automationLevel} exceeds capacity ${capacity}`,
      severity: 'error',
    });
  }

  if (step.expectedLatencyMinutes <= 0) {
    violations.push({
      key: 'invalid-latency',
      message: `Step ${step.id} must declare positive latency`,
      severity: 'error',
    });
  }

  if (step.actions.length === 0) {
    violations.push({
      key: 'empty-actions',
      message: `Step ${step.id} has no actions`,
      severity: 'warn',
    });
  }

  return {
    ok: violations.every((item) => item.severity !== 'error'),
    violations,
  };
};

export const canBlueprintRun = (
  blueprint: PlaybookBlueprint,
  context: ConstraintContext,
): { ok: boolean; violations: readonly ConstraintViolation[] } => {
  const violations: ConstraintViolation[] = [];
  const remaining = new Set<PlaybookStepId>(blueprint.steps.map((step) => step.id));
  const byId = new Map(blueprint.steps.map((step) => [step.id, step] as const));

  for (const step of blueprint.steps) {
    byId.set(step.id, step);
    const result = canStepRunWithContext(step, context);
    violations.push(...result.violations);

    if (step.dependencies.length > context.activeWorkload) {
      violations.push({
        key: 'dependency-overhead',
        message: `Step ${step.id} has more dependencies than workload`,
        severity: 'warn',
      });
    }
  }

  for (let i = 0; i < blueprint.steps.length; i++) {
    const ready = blueprint.steps
      .filter((candidate) => remaining.has(candidate.id) && candidate.dependencies.every((dep) => !remaining.has(dep)));

    if (ready.length === 0) {
      violations.push({
        key: 'cyclic-graph',
        message: 'Playbook has circular dependencies',
        severity: 'error',
      });
      break;
    }

    for (const step of ready.slice(0, 1)) {
      remaining.delete(step.id);
    }
  }

  if (blueprint.version <= 0) {
    violations.push({
      key: 'invalid-version',
      message: 'Blueprint version must be a positive integer',
      severity: 'error',
    });
  }

  const estimatedMinutes = blueprint.steps.reduce((total, step) => total + step.expectedLatencyMinutes, 0);
  if (estimatedMinutes > context.timeBudgetMinutes) {
    violations.push({
      key: 'aggregate-latency',
      message: `Estimated minutes ${estimatedMinutes} exceed time budget ${context.timeBudgetMinutes}`,
      severity: 'warn',
    });
  }

  if (blueprint.steps.length > maxConcurrencyByTier[context.riskTier] * 2) {
    violations.push({
      key: 'step-count',
      message: `Step count ${blueprint.steps.length} is above allowed capacity`,
      severity: 'info',
    });
  }

  const tierScore = severityWeight[toTierIndex(context.riskTier)];
  if (tierScore > 0 && estimatedMinutes / tierScore > 60) {
    violations.push({
      key: 'risk-cap',
      message: `Estimated minutes are high for risk tier ${context.riskTier}`,
      severity: 'info',
    });
  }

  return {
    ok: violations.every((entry) => entry.severity !== 'error'),
    violations,
  };
};
