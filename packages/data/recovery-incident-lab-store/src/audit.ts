import type { IncidentLabRun, IncidentLabPlan } from '@domain/recovery-incident-lab-core';
import type { LabStoreTelemetry } from './types';
import type { RecoveryIncidentLabRepository } from './repository';

export const computeTelemetry = async (
  repository: RecoveryIncidentLabRepository,
): Promise<LabStoreTelemetry> => {
  const scenarioQuery = await repository.listScenarios();
  const runQuery = await repository.listRuns();

  let latestSignal: unknown;
  const runs = await repository.listRuns();
  if (runs.items.length > 0) {
    latestSignal = runs.items[0]?.results.map((result) => result.sideEffects.join('|')).join('|') || undefined;
  }

  return {
    scenarioCount: scenarioQuery.total,
    planCount: (await repository.listPlansByScenario('')).total,
    runCount: runQuery.total,
    latestSignal: latestSignal as LabStoreTelemetry['latestSignal'],
  };
};

export const summarizeRun = (run: IncidentLabRun): string => {
  const done = run.results.filter((item) => item.status === 'done').length;
  const failed = run.results.filter((item) => item.status === 'failed').length;
  return `${run.runId}: done=${done}, failed=${failed}, state=${run.state}`;
};

export const summarizePlan = (plan: IncidentLabPlan): string =>
  `${plan.id} scenario=${plan.scenarioId} steps=${plan.selected.length} state=${plan.state}`;
