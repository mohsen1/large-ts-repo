import { RecoveryPlan } from '@domain/recovery-cockpit-models';

export type PolicyMode = 'readonly' | 'advisory' | 'enforce';

export type PolicyCheck = {
  readonly check: string;
  readonly allowed: boolean;
  readonly violations: readonly string[];
  readonly recommendations: readonly string[];
};

const enforceActionCount = (count: number): boolean => count <= 45;
const enforceSla = (slaMinutes: number): boolean => slaMinutes <= 240;
const hasSafeRollback = (plan: RecoveryPlan): boolean => plan.isSafe && plan.mode !== 'manual';

export const evaluatePlanPolicies = (plan: RecoveryPlan, mode: PolicyMode): readonly PolicyCheck[] => {
  const checks: PolicyCheck[] = [];

  const countOk = enforceActionCount(plan.actions.length);
  checks.push({
    check: 'action-limit',
    allowed: countOk || mode === 'readonly',
    violations: countOk ? [] : ['action-limit-exceeded'],
    recommendations: ['Split long recovery plan into stages.'],
  });

  const slaOk = enforceSla(plan.slaMinutes);
  checks.push({
    check: 'sla-limit',
    allowed: slaOk || mode === 'readonly' || plan.slaMinutes < 300,
    violations: slaOk ? [] : ['sla-limit-exceeded'],
    recommendations: ['Lower expected duration by moving dependency-independent tasks earlier.'],
  });

  const rollbackOk = hasSafeRollback(plan);
  checks.push({
    check: 'rollback-mode',
    allowed: rollbackOk || mode !== 'enforce',
    violations: rollbackOk ? [] : ['rollback-missing-for-manual-plan'],
    recommendations: ['Convert plan to semi-automated mode for safer rollback.'],
  });

  const dependenciesOk = plan.actions.every((action) => action.dependencies.every((dependency) =>
    plan.actions.some((candidate) => candidate.id === dependency)),
  );
  checks.push({
    check: 'dependency-consistency',
    allowed: dependenciesOk,
    violations: dependenciesOk ? [] : ['dependency-target-missing'],
    recommendations: ['Use only local action ids for dependencies.'],
  });

  return checks;
};

export const isAllowed = (checks: readonly PolicyCheck[]): boolean =>
  checks.every((check) => check.allowed);

export const riskScoreFromChecks = (checks: readonly PolicyCheck[]): number => {
  const failed = checks.filter((check) => !check.allowed).length;
  return Math.max(0, 100 - failed * 16);
};
