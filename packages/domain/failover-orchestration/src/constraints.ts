import { NonEmptyArray, DeepReadonly, UnionToIntersection } from '@shared/type-level';
import { FailoverEventMeta, StageConstraint, StageWindow, PlanSnapshot, RtoPlanState, FailoverPlan, isReady } from './models';

export interface ConstraintViolation {
  code: 'capacity-overrun' | 'overlapping-window' | 'invalid-rto' | 'missing-approvals';
  message: string;
}

export interface ConstraintContext {
  activeApprovals: ReadonlyArray<string>;
  maxRegionCapacity: number;
  minimumApprovals: number;
  slaBufferMinutes: number;
}

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
  errors: ConstraintViolation[];
}

const overlaps = (a: StageWindow, b: StageWindow): boolean => {
  const aStart = Date.parse(a.startsAt);
  const aEnd = aStart + a.durationMinutes * 60_000;
  const bStart = Date.parse(b.startsAt);
  const bEnd = bStart + b.durationMinutes * 60_000;

  return aStart < bEnd && bStart < aEnd;
};

export const dedupeViolations = (input: ConstraintViolation[]): ConstraintViolation[] => {
  const seen = new Set<string>();
  const output: ConstraintViolation[] = [];

  for (const violation of input) {
    const key = `${violation.code}:${violation.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(violation);
  }

  return output;
};

export const validateWindows = (snapshot: Readonly<PlanSnapshot>): ConstraintViolation[] => {
  const warnings: ConstraintViolation[] = [];
  const windows = snapshot.plan.windows;

  for (let i = 0; i < windows.length; i += 1) {
    for (let j = i + 1; j < windows.length; j += 1) {
      if (overlaps(windows[i], windows[j])) {
        warnings.push({
          code: 'overlapping-window',
          message: `window-${i} overlaps with window-${j}`,
        });
      }
    }

    for (const region of Object.values(windows[i].regions)) {
      if (region.capacityPercent > region.maxCapacityPercent) {
        warnings.push({
          code: 'capacity-overrun',
          message: `window-${i} over capacity in ${String(region.region)}`,
        });
      }
    }
  }

  return dedupeViolations(warnings);
};

export const summarizeConstraintCoverage = (values: readonly StageConstraint[]): StageConstraint => {
  return values.reduce<StageConstraint>(
    (acc, constraint) => ({
      canaryPercent: Math.max(acc.canaryPercent, constraint.canaryPercent),
      maxRetries: Math.max(acc.maxRetries, constraint.maxRetries),
      rollbackOnErrorRate: Math.max(acc.rollbackOnErrorRate, constraint.rollbackOnErrorRate),
    }),
    {
      canaryPercent: 0,
      maxRetries: 0,
      rollbackOnErrorRate: 0,
    },
  );
};

export const validateApprovals = (plan: Readonly<FailoverPlan>, context: ConstraintContext): ConstraintViolation[] => {
  const expected = Math.max(context.minimumApprovals, Math.ceil(plan.playbooks.length * 0.6));
  if (context.activeApprovals.length < expected) {
    return [{
      code: 'missing-approvals',
      message: `required-${expected} approvals; got ${context.activeApprovals.length}`,
    }];
  }

  return [];
};

export const validateSnapshot = (snapshot: Readonly<PlanSnapshot>, context: ConstraintContext): ValidationResult => {
  const violations = [...validateWindows(snapshot), ...validateApprovals(snapshot.plan, context)];
  const warnings = violations.filter((violation) => violation.code === 'overlapping-window').map((v) => v.message);
  const errors = violations.filter((violation) => violation.code !== 'overlapping-window');
  const slaSlack = snapshot.metrics.projectedRtoMinutes - snapshot.plan.targetRtoMinutes;
  if (slaSlack < context.slaBufferMinutes) {
    errors.push({
      code: 'invalid-rto',
      message: `rto is too close: projected ${snapshot.metrics.projectedRtoMinutes}, target ${snapshot.plan.targetRtoMinutes}`,
    });
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
};

export type ConstraintMatrix = ReturnType<typeof summarizeConstraintCoverage>;

export const canRunStateTransition = (current: RtoPlanState, next: RtoPlanState): boolean => {
  if (!isReady(current) && next === 'running') return false;
  if (current === 'running' && (next === 'draft' || next === 'ready')) return false;
  if (current === 'retired' && next === 'running') return false;
  return true;
};

export const formatMetaEvent = (meta: DeepReadonly<FailoverEventMeta>): string => {
  return [meta.requestId, meta.sourceRegion, meta.stage, meta.severity].join('::');
};

interface PrerequisiteNode {
  stageId: string;
  prerequisites?: string[];
}

export const collectPrerequisites = (graph: NonEmptyArray<PrerequisiteNode>): string[] => {
  const order: string[] = [];
  const visited = new Set<string>();

  const visit = (stage: { stageId: string; prerequisites?: string[] }) => {
    if (visited.has(stage.stageId)) return;
    visited.add(stage.stageId);
    for (const prereq of stage.prerequisites ?? []) {
      const node = graph.find((item) => item.stageId === prereq);
      if (node) visit(node);
    }
    order.push(stage.stageId);
  };

  for (const node of graph) {
    visit(node);
  }

  return order;
};
