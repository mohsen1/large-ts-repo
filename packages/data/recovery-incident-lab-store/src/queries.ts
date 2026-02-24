import type { IncidentLabScenario, IncidentLabPlan, IncidentLabRun } from '@domain/recovery-incident-lab-core';
import type { RecoveryIncidentLabRepository } from './repository';

export const latestByCreatedAt = <T extends { createdAt: string }>(items: readonly T[]): T | undefined =>
  [...items].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0];

export const filterRunsByState = (runs: readonly IncidentLabRun[], state: IncidentLabRun['state']): readonly IncidentLabRun[] =>
  runs.filter((run) => run.state === state);

export const countScenariosByOwner = (scenarios: readonly IncidentLabScenario[]): Map<string, number> => {
  const table = new Map<string, number>();
  for (const scenario of scenarios) {
    table.set(scenario.owner, (table.get(scenario.owner) ?? 0) + 1);
  }
  return table;
};

export const sortPlans = (plans: readonly IncidentLabPlan[], direction: 'desc' | 'asc' = 'desc'): readonly IncidentLabPlan[] => {
  const sorted = [...plans];
  sorted.sort((left, right) => {
    const leftTime = new Date(left.orderedAt).getTime();
    const rightTime = new Date(right.orderedAt).getTime();
    return direction === 'desc' ? rightTime - leftTime : leftTime - rightTime;
  });
  return sorted;
};

export const mapRepositoryCounts = async (repository: RecoveryIncidentLabRepository): Promise<{ readonly scenarioCount: number; readonly runCount: number }> => {
  const scenarios = await repository.listScenarios();
  const runs = await repository.listRuns();
  return {
    scenarioCount: scenarios.total,
    runCount: runs.total,
  };
};
