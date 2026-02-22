import type { DeepReadonly, Merge } from '@shared/type-level';
import type { ActionCandidate, PolicyConstraint, RecoveryActionPlan, RecoverySimulationResult, ScenarioWindowState, WindowStateUpdate } from './models';

export interface ConstraintViolation {
  readonly constraint: string;
  readonly detail: string;
  readonly severity: 'warning' | 'error';
}

export interface ConstraintContext {
  readonly nowUtc: string;
  readonly tenantTimezone: string;
}

export interface ConstraintInput {
  readonly plan: RecoveryActionPlan;
  readonly context: ConstraintContext;
  readonly constraints: DeepReadonly<PolicyConstraint>;
}

export interface ConstraintResult {
  readonly allowed: boolean;
  readonly violations: readonly ConstraintViolation[];
  readonly windowState: ScenarioWindowState;
}

export const evaluatePolicyConstraints = (input: ConstraintInput): ConstraintResult => {
  const violations: ConstraintViolation[] = [];
  const maxConcurrencyAllowed = input.constraints.maxConcurrency;

  if (input.plan.sequence.length > maxConcurrencyAllowed) {
    violations.push({
      constraint: 'maxConcurrency',
      detail: `planned-${input.plan.sequence.length}-actions exceeds max ${maxConcurrencyAllowed}`,
      severity: 'error',
    });
  }

  const unsupportedCategories = input.plan.sequence.filter((candidate) => !input.constraints.allowedCategories.includes(candidate.category));
  if (unsupportedCategories.length > 0) {
    violations.push({
      constraint: 'allowedCategories',
      detail: `Unsupported action categories: ${unsupportedCategories.map((candidate) => candidate.category).join(', ')}`,
      severity: 'error',
    });
  }

  const tooLong = input.constraints.slaMinutes > 0 && input.plan.estimatedCompletionMinutes > input.constraints.slaMinutes;
  if (tooLong) {
    violations.push({
      constraint: 'slaMinutes',
      detail: `estimated ${input.plan.estimatedCompletionMinutes}m exceeds SLA ${input.constraints.slaMinutes}m`,
      severity: 'warning',
    });
  }

  const inBlackout = input.constraints.blackoutWindows.find((window) => {
    return window.startUtc <= input.context.nowUtc && input.context.nowUtc <= window.endUtc;
  });

  if (inBlackout) {
    violations.push({
      constraint: 'blackoutWindows',
      detail: `Run start falls into blackout: ${inBlackout.windowId}`,
      severity: 'error',
    });
  }

  const allowed = violations.every((entry) => entry.severity === 'warning');
  return {
    allowed,
    violations,
    windowState: allowed ? 'approved' : 'draft',
  };
};

export const withConstraintMetadata = (result: ConstraintResult, state: RecoverySimulationResult): WindowStateUpdate => ({
  ...result,
  ...state,
  updatedAtUtc: new Date().toISOString(),
  windowState: result.windowState,
});

export type PolicyCheck<T extends PolicyConstraint = PolicyConstraint> = Merge<ConstraintInput, { readonly constraints: T }>;

export const allWarningsAsErrors = (input: readonly ConstraintViolation[]): readonly ConstraintViolation[] =>
  input.map((entry) => ({ ...entry, severity: 'error' as const }));

export const dependencyGraph = (actions: readonly ActionCandidate[]): readonly [ActionCandidate['actionId'], ActionCandidate['actionId']][] =>
  actions.flatMap((action) =>
    action.dependency.dependsOn.map(
      (dependency): [ActionCandidate['actionId'], ActionCandidate['actionId']] => [action.actionId, dependency],
    ),
  );
