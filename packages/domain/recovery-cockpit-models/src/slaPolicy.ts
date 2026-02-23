import { RecoveryPlan, RecoveryAction } from './runtime';
import { EntityId, PlanId, Region, UtcIsoTimestamp } from './identifiers';

export type SlaConstraintId = `sla:${string}`;

export type SlaConstraintMode = 'minimum' | 'target' | 'ceiling';

export type SlaConstraint = {
  readonly id: SlaConstraintId;
  readonly title: string;
  readonly description: string;
  readonly mode: SlaConstraintMode;
  readonly targetMinutes: number;
  readonly graceMinutes: number;
};

export type RegionSla = {
  readonly region: Region;
  readonly planId: PlanId;
  readonly constraint: SlaConstraint;
  readonly enforced: boolean;
  readonly expectedMinutes: number;
};

export type SlaEvaluationSample = {
  readonly constraintId: SlaConstraintId;
  readonly passed: boolean;
  readonly measuredMinutes: number;
  readonly marginMinutes: number;
  readonly reason: string;
};

export type SlaEvaluation = {
  readonly planId: PlanId;
  readonly evaluatedAt: UtcIsoTimestamp;
  readonly overallScore: number;
  readonly status: 'compliant' | 'warning' | 'breach';
  readonly samples: readonly SlaEvaluationSample[];
};

const DEFAULT_SLA: SlaConstraint = {
  id: 'sla:platform-default' as SlaConstraintId,
  title: 'platform baseline',
  description: 'Aggregate plan execution should remain within service-level target',
  mode: 'target',
  targetMinutes: 120,
  graceMinutes: 15,
};

const regionSlaForAction = (planId: PlanId, action: RecoveryAction, base: SlaConstraint): RegionSla => ({
  region: action.region as Region,
  planId,
  constraint: base,
  enforced: action.tags.includes('critical'),
  expectedMinutes: action.expectedDurationMinutes + action.dependencies.length,
});

const evaluateSample = (constraint: SlaConstraint, measuredMinutes: number): SlaEvaluationSample => {
  const marginMinutes = Number((constraint.targetMinutes - measuredMinutes).toFixed(2));
  const passed = constraint.mode === 'ceiling' ? measuredMinutes <= constraint.targetMinutes : measuredMinutes <= constraint.targetMinutes + constraint.graceMinutes;
  const reason = `${constraint.mode} violation check`;
  return {
    constraintId: constraint.id,
    passed,
    measuredMinutes,
    marginMinutes,
    reason,
  };
};

const computeStatus = (samples: readonly SlaEvaluationSample[]): SlaEvaluation['status'] => {
  const hasBreach = samples.some((sample) => !sample.passed && sample.marginMinutes < -constraintLimit());
  if (hasBreach) {
    return 'breach';
  }
  const hasWarning = samples.some((sample) => !sample.passed);
  return hasWarning ? 'warning' : 'compliant';
};

const constraintLimit = (): number => 2;

export const withSlaConstraint = (overrides?: Partial<SlaConstraint>): SlaConstraint => ({
  ...DEFAULT_SLA,
  ...overrides,
  id: (overrides?.id ?? DEFAULT_SLA.id) as SlaConstraintId,
});

export const evaluatePlanSla = (plan: RecoveryPlan, constraint: Partial<SlaConstraint> = {}): SlaEvaluation => {
  const resolvedConstraint = withSlaConstraint(constraint);
  const constraints: RegionSla[] = plan.actions.map((action) => regionSlaForAction(plan.planId, action, resolvedConstraint));
  const samples = constraints.map((entry) => {
    const measuredMinutes = entry.expectedMinutes + (entry.enforced ? 5 : 0);
    return evaluateSample(entry.constraint, measuredMinutes);
  });
  const score = samples.reduce(
    (acc, sample) => acc + (sample.passed ? 100 : 100 - Math.max(0, Math.abs(sample.marginMinutes) * 1.5)),
    0,
  ) / Math.max(1, samples.length);
  return {
    planId: plan.planId,
    evaluatedAt: new Date().toISOString() as UtcIsoTimestamp,
    overallScore: Number(score.toFixed(2)),
    status: computeStatus(samples),
    samples,
  };
};

export const sortByRegionPressure = (plans: readonly SlaEvaluation[]): readonly SlaEvaluation[] =>
  [...plans].sort((left, right) => {
    if (left.status === right.status) {
      return right.overallScore - left.overallScore;
    }
    return left.status === 'breach' ? 1 : right.status === 'breach' ? -1 : 0;
  });

export const summarizeConstraintHealth = (plan: RecoveryPlan, constraint: Partial<SlaConstraint> = {}): string => {
  const evaluation = evaluatePlanSla(plan, constraint);
  const worst = evaluation.samples
    .map((sample) => sample.marginMinutes)
    .reduce((acc, value) => (acc === undefined || value < acc ? value : acc), 0 as number);
  const statusBadge = evaluation.status.toUpperCase();
  return `${evaluation.planId} ${statusBadge} score=${evaluation.overallScore} worst=${worst}m`;
};

export const findConstraintViolations = (plans: readonly SlaEvaluation[]): readonly SlaEvaluation[] =>
  plans.filter((entry) => entry.status !== 'compliant');

export const estimateSlaWindow = (plan: RecoveryPlan): { startsAt: UtcIsoTimestamp; endsAt: UtcIsoTimestamp } => {
  const startsAt = new Date().toISOString() as UtcIsoTimestamp;
  const ends = new Date();
  ends.setMinutes(ends.getMinutes() + Math.max(1, plan.slaMinutes));
  return {
    startsAt,
    endsAt: ends.toISOString() as UtcIsoTimestamp,
  };
};

export const collectTouchedActions = (actions: readonly RecoveryAction[]): ReadonlyArray<EntityId> =>
  actions
    .map((action) => action.id)
    .filter((id, index, values) => values.indexOf(id) === index);
