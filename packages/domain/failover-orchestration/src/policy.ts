import { Brand } from '@shared/type-level';
import { constraintUnion } from './models';
import { StageConstraint, PlanSnapshot, ValidationResult, RunContext } from './models';
import { validateSnapshot, validateApprovals, validateWindows, ConstraintContext } from './constraints';

export interface EnforcementPolicy {
  id: Brand<string, 'PolicyId'>;
  description: string;
  requiredCanaryPercent: number;
  maxWindowOverlaps: number;
  requireApprovals: boolean;
}

export interface PolicyDecision {
  policyId: Brand<string, 'PolicyId'>;
  accepted: boolean;
  rationale: string[];
  violations: Array<{ code: string; message: string }>;
}

const basePolicy: EnforcementPolicy = {
  id: 'failover-policy-v1' as Brand<string, 'PolicyId'>,
  description: 'default plan-level controls',
  requiredCanaryPercent: 5,
  maxWindowOverlaps: 1,
  requireApprovals: true,
};

const createDefaultContext = (planWindowCount: number): ConstraintContext => ({
  activeApprovals: [],
  maxRegionCapacity: 100,
  minimumApprovals: Math.max(2, Math.min(4, planWindowCount)),
  slaBufferMinutes: 20,
});

export const evaluatePolicy = (snapshot: Readonly<PlanSnapshot>): ValidationResult => {
  const ctx = createDefaultContext(snapshot.plan.windows.length);
  return validateSnapshot(snapshot, ctx);
};

export const evaluateWithPolicy = (
  snapshot: Readonly<PlanSnapshot>,
  policy: EnforcementPolicy = basePolicy,
): PolicyDecision => {
  const context: ConstraintContext = {
    activeApprovals: snapshot.plan.ownerTeam ? [snapshot.plan.ownerTeam] : [],
    maxRegionCapacity: 100,
    minimumApprovals: policy.requireApprovals ? 2 : 0,
    slaBufferMinutes: 20,
  };

  const windows = validateWindows(snapshot);
  const approvals = validateApprovals(snapshot.plan, context);
  const warnings = windows.concat(approvals);

  const overlapCount = warnings.filter((w) => w.code === 'overlapping-window').length;
  const constraintViolations = warnings
    .map((warning) => ({
      code: warning.code,
      message: warning.message,
    }));

  const stageConstraint = constraintUnion(snapshot.plan.windows.map(() => ({
    canaryPercent: policy.requiredCanaryPercent,
    maxRetries: 3,
    rollbackOnErrorRate: 0.25,
  })) as StageConstraint;

  const accepted = overlapCount <= policy.maxWindowOverlaps && stageConstraint.canaryPercent >= policy.requiredCanaryPercent;

  return {
    policyId: policy.id,
    accepted,
    rationale: [
      `max overlaps: ${overlapCount}/${policy.maxWindowOverlaps}`,
      `required canary percent: ${policy.requiredCanaryPercent}`,
      `computed canary percent: ${stageConstraint.canaryPercent}`,
    ],
    violations: constraintViolations,
  };
};

export const policyRegistry = {
  base: basePolicy,
  strict: {
    ...basePolicy,
    id: 'failover-policy-strict' as Brand<string, 'PolicyId'>,
    requiredCanaryPercent: 10,
    maxWindowOverlaps: 0,
  },
  rapid: {
    ...basePolicy,
    id: 'failover-policy-rapid' as Brand<string, 'PolicyId'>,
    requiredCanaryPercent: 2,
    maxWindowOverlaps: 3,
  },
};

export const runbookSignature = (planId: string, context: RunContext): string => {
  const approved = context.approvedBy.join(',');
  return `${planId}#${context.operator}@${approved}`;
};
