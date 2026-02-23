import type {
  SimulationActorAvailability,
  SimulationDependency,
  SimulationPlanDraft,
  SimulationBand,
} from './types';

export interface ConstraintViolation {
  readonly code: string;
  readonly message: string;
  readonly severity: 'low' | 'medium' | 'high';
}

export const resolveDuplicateDependencies = (dependencies: readonly SimulationDependency[]): readonly SimulationDependency[] => {
  const byId = new Map<string, SimulationDependency>();
  for (const dependency of dependencies) {
    const existing = byId.get(dependency.dependencyId);
    if (!existing) {
      byId.set(dependency.dependencyId, dependency);
      continue;
    }

    byId.set(dependency.dependencyId, {
      dependencyId: dependency.dependencyId,
      requiredDependencyIds: [...new Set([...existing.requiredDependencyIds, ...dependency.requiredDependencyIds])].sort(),
      criticalityWeight: Math.max(existing.criticalityWeight, dependency.criticalityWeight),
    });
  }

  return [...byId.values()];
};

const toCapacity = (actors: readonly SimulationActorAvailability[]): number =>
  actors.reduce((sum, actor) => sum + actor.maxConcurrentSteps * (1 - actor.fatigueIndex), 0);

export const estimateExecutionBand = (
  draft: SimulationPlanDraft,
  actors: readonly SimulationActorAvailability[],
): SimulationBand => {
  const capacity = Math.max(0.0001, toCapacity(actors));
  const demand = draft.maxParallelSteps * Math.max(1, draft.minActorsPerBatch);
  const ratio = demand / capacity;

  if (ratio >= 1.4) return 'extreme';
  if (ratio >= 1.0) return 'critical';
  if (ratio >= 0.7) return 'elevated';
  return 'steady';
};

export const normalizeActors = (actors: readonly SimulationActorAvailability[]): readonly SimulationActorAvailability[] =>
  actors
    .map((actor) => ({ ...actor, fatigueIndex: Math.min(1, Math.max(0, actor.fatigueIndex) ) }))
    .sort((left, right) => left.actorId.localeCompare(right.actorId));

export const validateDependencyCoverage = (
  dependencies: readonly SimulationDependency[],
  actorIds: readonly string[],
): readonly ConstraintViolation[] => {
  const actorSet = new Set(actorIds);
  const missing = dependencies.flatMap((dependency) =>
    dependency.requiredDependencyIds.filter((requiredDependencyId) => !actorSet.has(requiredDependencyId)),
  );

  if (missing.length === 0) return [];

  return [
    {
      code: 'missing_actor_binding',
      message: `dependency mapping includes unknown actors: ${missing.join(', ')}`,
      severity: 'high',
    },
  ];
};

export const validateDraft = (draft: SimulationPlanDraft, actors: readonly SimulationActorAvailability[]): readonly ConstraintViolation[] => {
  const violations: ConstraintViolation[] = [];
  if (draft.budgetMinutes <= 0) {
    violations.push({ code: 'budget', message: 'budgetMinutes must be positive', severity: 'high' });
  }
  if (draft.maxParallelSteps < 1 || draft.maxParallelSteps > 16) {
    violations.push({ code: 'max_parallel', message: 'maxParallelSteps must be in range 1..16', severity: 'medium' });
  }

  const capacity = toCapacity(actors);
  const ratio = draft.minActorsPerBatch / Math.max(1, capacity);
  if (ratio > 0.35) {
    violations.push({ code: 'capacity_pressure', message: 'minimum actor pool is near exhaustion', severity: 'medium' });
  }

  return violations;
};
