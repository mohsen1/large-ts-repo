import { ContinuityConstraint, ContinuityPlan, ContinuitySignal, RiskBand, SimulationOutcome } from './types';

export interface ConstraintInput {
  readonly signals: ReadonlyArray<ContinuitySignal>;
  readonly plan: ContinuityPlan;
}

export const evaluateCoverage = (input: ConstraintInput, baseline: number): number => {
  const relevantSignals = input.signals.filter((signal) => input.plan.actions.some((action) => action.preconditions.includes(signal.kind)));
  if (input.signals.length === 0) {
    return 0;
  }
  const covered = relevantSignals.length / input.signals.length;
  return Math.max(0, Math.min(1, covered * baseline));
};

const scoreRiskBand = (value: number): RiskBand => {
  if (value <= 0.35) {
    return 'green';
  }
  if (value <= 0.65) {
    return 'amber';
  }
  return 'red';
};

export const evaluateConstraints = (constraints: ReadonlyArray<ContinuityConstraint>, outcome: Omit<SimulationOutcome, 'scenarioId'>): ReadonlyArray<
  ReturnType<typeof mapViolation>
> => {
  const violations = [] as ReturnType<typeof mapViolation>[];
  for (const constraint of constraints) {
    if (outcome.risk > constraint.maxRisk) {
      violations.push(mapViolation(constraint, `risk:${outcome.risk.toFixed(3)}`, `Risk exceeds ${constraint.maxRisk}`));
    }
    if (outcome.coverage < constraint.minCoverage) {
      violations.push(mapViolation(constraint, `coverage:${outcome.coverage.toFixed(3)}`, `Coverage below ${constraint.minCoverage}`));
    }
  }
  return violations;
};

const mapViolation = (
  constraint: ContinuityConstraint,
  title: string,
  detail: string,
) => ({
  code: `${constraint.constraintId}:${title}`,
  severity: scoreRiskBand(constraint.maxRisk),
  title,
  detail,
});

export const pickViability = (violations: ReadonlyArray<ReturnType<typeof mapViolation>>): number => {
  const redPenalty = violations.filter((violation) => violation.severity === 'red').length * 0.3;
  const amberPenalty = violations.filter((violation) => violation.severity === 'amber').length * 0.15;
  const greenPenalty = violations.filter((violation) => violation.severity === 'green').length * 0.05;
  const score = 1 - (redPenalty + amberPenalty + greenPenalty);
  return Number(Math.max(0, Math.min(1, score)).toFixed(3));
};

export const rankConstraints = (
  constraints: ReadonlyArray<ContinuityConstraint>,
): Array<ContinuityConstraint & { rank: number }> => {
  return [...constraints]
    .map((constraint) => ({
      ...constraint,
      rank: Number((1 - constraint.maxRisk + constraint.minCoverage).toFixed(3)),
    }))
    .sort((left, right) => left.rank - right.rank);
};
