import { toTimestamp } from './identifiers';
import { RecoveryPlan } from './runtime';
import { PlanId } from './identifiers';
import { RecoveryAction } from './runtime';

export type ContractClauseKind =
  | 'must-complete'
  | 'no-downtime'
  | 'operator-signoff'
  | 'region-cap'
  | 'manual-check';

export type PlanContractClause = {
  readonly kind: ContractClauseKind;
  readonly title: string;
  readonly description: string;
  readonly requiredTags: readonly string[];
  readonly softLimitMinutes: number;
  readonly enforced: boolean;
  readonly owner: string;
};

export type PlanContractId = `contract:${string}`;
export type ContractResult = 'compliant' | 'warning' | 'violation' | 'error';

export type PlanContractEvaluation = {
  readonly planId: PlanId;
  readonly contractId: PlanContractId;
  readonly evaluatedAt: string;
  readonly result: ContractResult;
  readonly clauses: ReadonlyArray<{ clause: PlanContractClause; pass: boolean; reasons: readonly string[] }>;
  readonly score: number;
};

const ensureRequiredTag = (action: RecoveryAction, required: readonly string[]): boolean =>
  required.every((item) => action.tags.includes(item));

const regionDistinctCount = (plan: RecoveryPlan): number => new Set(plan.actions.map((action) => action.region)).size;

const computeClauseScore = (clauses: readonly boolean[]): number => {
  if (clauses.length === 0) {
    return 100;
  }
  const passCount = clauses.filter(Boolean).length;
  return Number(((passCount / clauses.length) * 100).toFixed(2));
};

export const createPlanContractId = (planId: PlanId): PlanContractId => `contract:${planId}:${Math.random().toString(36).slice(2)}` as PlanContractId;

export const defaultPlanContract = (planId: PlanId): PlanContractClause[] => [
  {
    kind: 'must-complete',
    title: 'must complete',
    description: 'Plan must have all planned action dependencies resolvable',
    requiredTags: ['readiness'],
    softLimitMinutes: 180,
    enforced: true,
    owner: 'recovery-platform',
  },
  {
    kind: 'no-downtime',
    title: 'no downtime',
    description: 'Every service action should avoid explicit kill operations',
    requiredTags: ['stateful'],
    softLimitMinutes: 120,
    enforced: false,
    owner: 'sre',
  },
  {
    kind: 'operator-signoff',
    title: 'operator signoff',
    description: 'Manual plans should be marked safe before execution',
    requiredTags: ['manual'],
    softLimitMinutes: 120,
    enforced: false,
    owner: 'ops',
  },
];

export const evaluatePlanContract = (plan: RecoveryPlan): PlanContractEvaluation => {
  const clauses = defaultPlanContract(plan.planId);
  const evaluated = clauses.map((clause) => {
    let pass = true;
    const reasons: string[] = [];

    if (clause.kind === 'must-complete') {
      const broken = plan.actions.some((action) =>
        action.dependencies.some((dependency) => !plan.actions.some((candidate) => candidate.id === dependency)),
      );
      pass = !broken;
      if (broken) reasons.push('dependency missing');
    }

    if (clause.kind === 'no-downtime') {
      const hasKill = plan.actions.some((action) => action.command.includes('kill') || action.command.includes('terminate'));
      pass = !hasKill;
      if (hasKill) reasons.push('destructive command detected');
    }

    if (clause.kind === 'operator-signoff') {
      const readiness = ensureRequiredTag({ ...plan.actions[0]!, tags: plan.labels.labels }, clause.requiredTags);
      pass = plan.mode !== 'manual' || readiness;
      if (!pass) reasons.push('manual plan missing readiness signal tags');
    }

    if (clause.kind === 'region-cap') {
      pass = regionDistinctCount(plan) <= 3;
      if (!pass) reasons.push('more than three regions in one run');
    }

    if (clause.kind === 'manual-check') {
      pass = plan.actions.length <= clause.softLimitMinutes;
      if (!pass) reasons.push('too many actions for manual gate');
    }

    return { clause, pass, reasons };
  });

  const checks = evaluated.map((entry) => entry.pass);
  const score = computeClauseScore(checks);
  const anyViolation = evaluated.some((entry) => entry.clause.enforced && !entry.pass);

  return {
    planId: plan.planId,
    contractId: createPlanContractId(plan.planId),
    evaluatedAt: toTimestamp(new Date()),
    result: anyViolation ? 'violation' : score >= 90 ? 'compliant' : score >= 70 ? 'warning' : 'error',
    clauses: evaluated,
    score,
  };
};

export const contractStatusBadge = (evaluation: PlanContractEvaluation): string =>
  `${evaluation.planId} ${evaluation.result} (${evaluation.score})`;

export const rankContracts = (evaluations: readonly PlanContractEvaluation[]): readonly PlanContractEvaluation[] =>
  [...evaluations].sort((left, right) => {
    if (left.result === right.result) {
      return right.score - left.score;
    }
    const order: Record<ContractResult, number> = { violation: 3, error: 2, warning: 1, compliant: 0 };
    return order[left.result] - order[right.result];
  });

export const mergeContractEvaluations = (
  base: PlanContractEvaluation,
  incoming: PlanContractEvaluation,
): PlanContractEvaluation => ({
  ...incoming,
  score: Number(((base.score + incoming.score) / 2).toFixed(2)),
  clauses: [...base.clauses, ...incoming.clauses],
  evaluatedAt: toTimestamp(new Date()),
});
