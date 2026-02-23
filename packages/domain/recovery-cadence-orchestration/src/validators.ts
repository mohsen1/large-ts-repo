import { isActiveState } from './types';
import type {
  CadencePlan,
  CadenceIntent,
  CadenceWindow,
  CadenceConstraint,
  CadenceRisk,
} from './types';

export interface CadenceWindowValidationIssue {
  code: 'overlap' | 'duration' | 'constraint' | 'state-transition';
  windowId: CadenceWindow['id'];
  message: string;
}

export interface CadenceValidationResult {
  ok: boolean;
  warnings: string[];
  issues: CadenceWindowValidationIssue[];
}

export const validateWindowOrdering = (plan: CadencePlan): CadenceValidationResult => {
  const issues: CadenceWindowValidationIssue[] = [];
  const warnings: string[] = [];
  const sorted = [...plan.windows].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));

  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    if (Date.parse(previous.endAt) > Date.parse(current.startAt)) {
      issues.push({
        code: 'overlap',
        windowId: current.id,
        message: `Window ${current.name} overlaps prior window ${previous.name}`,
      });
    }
  }

  const minimumDurationMinutes = 5;
  for (const window of sorted) {
    const durationMs = Date.parse(window.endAt) - Date.parse(window.startAt);
    if (durationMs <= minimumDurationMinutes * 60 * 1000) {
      issues.push({
        code: 'duration',
        windowId: window.id,
        message: `Window ${window.name} shorter than ${minimumDurationMinutes} minutes`,
      });
    }
  }

  return { ok: issues.length === 0, warnings, issues };
};

export const validatePlanConstraints = (
  plan: CadencePlan,
  constraints: readonly CadenceConstraint[],
): CadenceValidationResult => {
  const issues: CadenceWindowValidationIssue[] = [];
  const warnings: string[] = [];

  for (const constraint of constraints) {
    const window = plan.windows.find((candidate) => candidate.id === constraint.windowId);
    if (!window) {
      warnings.push(`Constraint ${constraint.id} references missing window ${constraint.windowId}`);
      continue;
    }

    if (window.lagMinutes > constraint.maxLagMinutes) {
      issues.push({
        code: 'constraint',
        windowId: window.id,
        message: `Lag ${window.lagMinutes} exceeds ${constraint.maxLagMinutes} for ${constraint.id}`,
      });
    }

    if (window.leadMinutes > constraint.maxLeadMinutes) {
      issues.push({
        code: 'constraint',
        windowId: window.id,
        message: `Lead ${window.leadMinutes} exceeds ${constraint.maxLeadMinutes} for ${constraint.id}`,
      });
    }

    if (window.tags.length > constraint.maxConcurrentWindows) {
      warnings.push(`Window ${window.name} has unusually many tags for ${constraint.id}`);
    }
  }

  return { ok: issues.length === 0, warnings, issues };
};

export const validateWindowRisk = (window: CadenceWindow): CadenceWindowValidationIssue[] => {
  const issues: CadenceWindowValidationIssue[] = [];
  const riskRank: Record<CadenceRisk, number> = {
    minimal: 0,
    elevated: 1,
    significant: 2,
    critical: 3,
  };

  if (!isActiveState(window.state) && window.risk === 'critical') {
    issues.push({
      code: 'state-transition',
      windowId: window.id,
      message: 'Critical risk windows should not be in inactive states before execution start',
    });
  }

  if (riskRank[window.risk] >= riskRank.significant && window.intensity !== 'high' && window.intensity !== 'critical') {
    issues.push({
      code: 'constraint',
      windowId: window.id,
      message: `Risk ${window.risk} should usually be managed by high/critical intensity`,
    });
  }

  return issues;
};

export const validatePlan = (
  plan: CadencePlan,
  intents: readonly CadenceIntent[],
  constraints: readonly CadenceConstraint[],
): CadenceValidationResult => {
  const ordering = validateWindowOrdering(plan);
  const constrained = validatePlanConstraints(plan, constraints);
  const riskIssues = plan.windows.flatMap((window) => validateWindowRisk(window));
  const duplicateOwners = intents.map((intent) => intent.requestedBy).filter((owner, index, list) => list.indexOf(owner) !== index);
  const warnings = [...ordering.warnings, ...constrained.warnings];

  if (duplicateOwners.length > 0) {
    warnings.push(`Repeated intent submitters detected: ${[...new Set(duplicateOwners)].join(', ')}`);
  }

  const issues = [...ordering.issues, ...constrained.issues, ...riskIssues];
  return {
    ok: issues.length === 0,
    warnings,
    issues,
  };
};
