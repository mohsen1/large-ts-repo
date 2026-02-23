import type { SurfacePlan, SurfaceRun } from '@domain/recovery-command-surface-models';

export interface SurfaceQueryFilter {
  readonly tenant?: string;
  readonly planIds?: readonly string[];
  readonly minRisk?: number;
}

export interface SurfaceQuery {
  readonly plans: readonly SurfacePlan[];
  readonly runs: readonly SurfaceRun[];
}

export const filterByTenant = (input: SurfaceQueryFilter, plans: readonly SurfacePlan[], runs: readonly SurfaceRun[]): SurfaceQuery => {
  const activePlans = plans.filter((plan) => !input.tenant || plan.surface.tenant === input.tenant);
  const activePlanIds = new Set(activePlans.map((plan) => plan.id));
  const matchingRuns = runs.filter((run) => {
    const planMatch = activePlanIds.has(run.planId);
    const included = input.planIds ? (input.planIds.length === 0 || input.planIds.includes(run.planId)) : true;
    const riskMatch = input.minRisk === undefined ? true : run.riskScore >= input.minRisk;
    return planMatch && included && riskMatch;
  });
  return { plans: activePlans, runs: matchingRuns };
};

export const sortPlansByRisk = (plans: readonly SurfacePlan[]): readonly SurfacePlan[] =>
  [...plans].sort((left, right) => left.constraints.maxRisk - right.constraints.maxRisk);

export const summarizeSignals = (runs: readonly SurfaceRun[]): ReadonlyMap<string, number> => {
  const aggregate = new Map<string, number>();
  for (const run of runs) {
    aggregate.set(run.tenant, (aggregate.get(run.tenant) ?? 0) + run.signals.length);
  }
  return aggregate;
};
