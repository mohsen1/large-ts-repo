import type { SimulationPlanDraft, SimulationLabBlueprint, SimulationDependency, SimulationActorAvailability } from './types';

export interface DraftValidationIssue {
  readonly code: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly issues: readonly DraftValidationIssue[];
}

export const validateDraft = (draft: SimulationPlanDraft): ValidationResult => {
  const issues: DraftValidationIssue[] = [];
  if (draft.budgetMinutes <= 0) {
    issues.push({ code: 'budget', message: 'budgetMinutes must be positive' });
  }
  if (draft.maxParallelSteps < 1 || draft.maxParallelSteps > 16) {
    issues.push({ code: 'parallel', message: 'maxParallelSteps out of range' });
  }
  return { ok: issues.length === 0, issues };
};

export const validateBlueprint = (blueprint: SimulationLabBlueprint): ValidationResult => {
  const issueMissingFields = !blueprint.id || !blueprint.ownerTeam;
  if (!issueMissingFields) {
    return { ok: true, issues: [] };
  }
  return { ok: false, issues: [{ code: 'missing-fields', message: 'blueprint missing mandatory fields' }] };
};

export const validateDependency = (
  dependency: SimulationDependency,
  actors: readonly SimulationActorAvailability[],
): ValidationResult => {
  const actorSet = new Set(actors.map((actor) => actor.actorId));
  const missing = dependency.requiredDependencyIds.filter((required) => !actorSet.has(required));
  if (missing.length > 0) {
    return { ok: false, issues: [{ code: 'dependency', message: `missing actors ${missing.join(',')}` }] };
  }
  return { ok: true, issues: [] };
};
