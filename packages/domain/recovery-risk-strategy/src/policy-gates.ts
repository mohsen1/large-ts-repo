import type {
  ConstraintState,
  RiskBudget,
  RiskConstraint,
  RiskSignalWeight,
  RiskScenario,
  SeverityBand,
  StrategyCommandInput,
  StrategySignalPack,
  StrategyExecutionResult,
} from './types';
import { classifySeverity, weightedAverage } from './scoring';

export interface GateDecision {
  readonly allowed: boolean;
  readonly state: ConstraintState;
  readonly rationale: readonly string[];
  readonly scoreDelta: number;
}

export interface ConstraintValidation {
  readonly constraint: RiskConstraint;
  readonly valid: boolean;
  readonly message: string;
}

const isActive = (constraint: RiskConstraint): boolean =>
  constraint.state === 'enforced' || constraint.state === 'breached' || constraint.state === 'escalated';

const checkConstraint = (constraint: RiskConstraint, sample: number): ConstraintValidation => {
  if (!isActive(constraint)) {
    return {
      constraint,
      valid: true,
      message: `constraint ${constraint.constraintId} ignored while ${constraint.state}`,
    };
  }

  const valid = sample >= constraint.minimum && sample <= constraint.maximum;
  return {
    constraint,
    valid,
    message: valid
      ? `constraint ${constraint.dimension} satisfied (${sample})`
      : `constraint ${constraint.dimension} violated (${sample} outside [${constraint.minimum}, ${constraint.maximum}])`,
  };
};

const budgetSlack = (budget: RiskBudget, utilization: number): number => {
  if (budget.hardCap === 0) {
    return 0;
  }

  return Math.max(0, budget.hardCap - utilization);
};

export const evaluateConstraints = (scenario: RiskScenario, pack: StrategySignalPack): GateDecision => {
  const validations = scenario.constraints.map((constraint) => {
    const vector = pack.vectors.find((entry) => entry.dimension === constraint.dimension);
    const sample = vector?.score ?? 0;
    return checkConstraint(constraint, sample);
  });

  const invalid = validations.filter((entry) => !entry.valid);
  if (invalid.length === 0) {
    return {
      allowed: true,
      state: 'enforced',
      rationale: validations.map((entry) => entry.message),
      scoreDelta: 0,
    };
  }

  return {
    allowed: invalid.every((entry) => entry.constraint.state !== 'breached'),
    state: invalid.some((entry) => entry.constraint.state === 'escalated') ? 'escalated' : 'breached',
    rationale: invalid.map((entry) => entry.message),
    scoreDelta: invalid.length * 12,
  };
};

export const evaluateBudgets = (pack: StrategySignalPack, weights: readonly RiskSignalWeight[]): GateDecision => {
  const totals = pack.vectors.reduce((acc, vector) => {
    return {
      ...acc,
      [vector.dimension]:
        (acc[vector.dimension] ?? 0) + vector.score * (weights.find((entry) => entry.dimension === vector.dimension)?.weight ?? 1),
    };
  }, {} as Record<string, number>);

  const budgetDecisions = pack.budgets.map((budget) => {
    const key = budget.name.includes('network') ? 'dependencyCoupling' : 'blastRadius';
    const utilization = totals[key] ?? 0;
    const slack = budgetSlack(budget, utilization);
    return `${budget.name}: slack=${slack.toFixed(2)} (soft=${budget.softCap}, hard=${budget.hardCap})`;
  });

  const breached = budgetDecisions.some((decision) => decision.includes('slack=0.00'));
  return {
    allowed: !breached,
    state: breached ? 'escalated' : 'enforced',
    rationale: budgetDecisions,
    scoreDelta: breached ? 15 : 0,
  };
};

export const deriveSeverityFromPack = (pack: StrategySignalPack): SeverityBand => {
  return classifySeverity(weightedAverage(pack.vectors));
};

export const gateInputFromCommand = (input: StrategyCommandInput): GateDecision => {
  const pack: StrategySignalPack = {
    scenarioId: input.scenario.scenarioId,
    vectors: input.signals.map((signal) => ({
      dimension: signal.signalName,
      score: signal.score,
      weight: 1,
      confidence: signal.confidence,
    })),
    constraints: input.constraints,
    budgets: input.budgets,
    generatedAt: new Date().toISOString(),
  };

  const constraintDecision = evaluateConstraints(input.scenario, pack);
  const budgetDecision = evaluateBudgets(pack, input.strategy.weights);

  return {
    allowed: constraintDecision.allowed && budgetDecision.allowed,
    state: constraintDecision.allowed && budgetDecision.allowed ? 'enforced' : 'escalated',
    rationale: ['constraint', ...constraintDecision.rationale, 'budget', ...budgetDecision.rationale],
    scoreDelta: constraintDecision.scoreDelta + budgetDecision.scoreDelta,
  };
};

export const summarizeConstraints = (constraints: readonly RiskConstraint[]): string => {
  return constraints
    .map((constraint) => `${constraint.constraintId}:${constraint.dimension}[${constraint.minimum},${constraint.maximum}]${constraint.state}`)
    .join('|');
};

export const summarizeBudgets = (budget: readonly RiskBudget[]): string => {
  return budget
    .map((entry) => `${entry.name}:${entry.resourceClass}(soft=${entry.softCap},hard=${entry.hardCap})`)
    .join('|');
};

export const decisionText = (decision: GateDecision): string => {
  return `allowed=${decision.allowed}, state=${decision.state}, delta=${decision.scoreDelta}, reasons=${decision.rationale.length}`;
};

export const resultSeveritySummary = (result: StrategyExecutionResult): string => {
  return `${result.run.runId}:${result.severityBand}:${result.vector.vectors.length}`;
};
