import {
  calculateSignalStrength,
  isWindowOverlapping,
  mergeSignals,
  normalizeConstraint,
  normalizeWindow,
  OperationConstraint,
  OperationSignal,
  OperationWindow,
  PlanDraft,
  Severity,
  StepSelector,
  StepState,
} from './types';

export interface PolicyInput {
  tenantId: string;
  policyName: string;
  maxWindowConcurrent: number;
  blockedSeverities: readonly Severity[];
  allowedRegions: readonly string[];
  minHealthyPercent: number;
}

export interface PolicyEvaluation {
  allowed: boolean;
  reasons: readonly string[];
}

export interface PlanTemplate {
  id: string;
  policyName: string;
  defaultWindow: OperationWindow;
  constraintOverrides: Partial<OperationConstraint>;
  stepSelector: StepSelector<any>;
}

export interface PolicyCollection {
  name: string;
  owner: string;
  constraints: OperationConstraint[];
  labels: string[];
}

export const severityPriority: Record<Severity, number> = {
  none: 0,
  minor: 1,
  major: 2,
  critical: 4,
};

export const createPolicy = (value: PolicyInput): PlanTemplate => ({
  id: `${value.tenantId}:${value.policyName}`,
  policyName: value.policyName,
  defaultWindow: normalizeWindow({
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    kind: 'maintenance',
  }),
  constraintOverrides: normalizeConstraint({
    maxConcurrentOperations: value.maxWindowConcurrent,
    minHealthyPercent: value.minHealthyPercent,
    blockedSeverities: [...value.blockedSeverities],
    allowedRegions: [...value.allowedRegions],
  }),
  stepSelector: (_step): boolean => true,
});

export const evaluatePolicy = (
  planDraft: Pick<PlanDraft, 'constraints' | 'severity' | 'window'>,
  policy: PlanTemplate,
): PolicyEvaluation => {
  const reasons: string[] = [];
  const constraints = normalizeConstraint(planDraft.constraints);
  const blockedBySeverity = constraints.blockedSeverities.includes(planDraft.severity);
  if (blockedBySeverity) reasons.push(`severity ${planDraft.severity} is currently blocked`);

  const base = normalizeWindow(planDraft.window);
  const overlap = isWindowOverlapping(base, policy.defaultWindow);
  if (overlap) reasons.push('window overlaps policy template window');

  if (constraints.maxConcurrentOperations < 1) reasons.push('maxConcurrentOperations must be at least 1');
  if (constraints.minHealthyPercent < 50) reasons.push('minHealthyPercent below policy threshold');

  return {
    allowed: reasons.length === 0,
    reasons,
  };
};

export const evaluateDecision = (
  decision: PolicyEvaluation,
  stepStates: readonly StepState[],
): PolicyEvaluation => {
  const blockedStates = stepStates.filter((state) => state === 'blocked' || state === 'failed');
  if (blockedStates.length > 0) {
    return {
      ...decision,
      allowed: false,
      reasons: [...decision.reasons, `blocked by step state: ${blockedStates.join(', ')}`],
    };
  }
  return decision;
};

export const selectSignalsForWindow = <T extends Record<string, unknown>>(
  signals: readonly OperationSignal<T>[],
  severity: Severity,
): readonly OperationSignal<T>[] => {
  const ranked = mergeSignals(signals, []);
  const cap = severityPriority[severity] >= 2 ? 12 : 8;
  return ranked.slice(0, cap);
};

export const estimateSignalCoverage = <T extends Record<string, unknown>>(
  signals: readonly OperationSignal<T>[],
  target: number,
): number => {
  if (!Number.isFinite(target) || target <= 0) return 0;
  const strength = calculateSignalStrength(signals);
  return Math.max(0, Math.min(100, Math.round((strength / target) * 100)));
};

export const summarizePolicy = (policy: PlanTemplate): string =>
  `${policy.id} window=${policy.defaultWindow.startsAt}->${policy.defaultWindow.endsAt}`;
