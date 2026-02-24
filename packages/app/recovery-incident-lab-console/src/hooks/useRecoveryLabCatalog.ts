import { useEffect, useMemo, useState } from 'react';
import {
  type IncidentLabScenario,
  type IncidentLabPlan,
  type IncidentLabRun,
} from '@domain/recovery-incident-lab-core';
import { InMemoryRecoveryIncidentLabRepository, type RecoveryIncidentLabRepository } from '@data/recovery-incident-lab-store';
import { buildCatalog, findByOwner } from '@data/recovery-incident-lab-store';
import { calculateNodePressure } from '@domain/recovery-incident-lab-core';
import { buildLabTopology } from '@domain/recovery-incident-lab-core';

interface CatalogState {
  readonly scenarios: readonly IncidentLabScenario[];
  readonly plans: readonly IncidentLabPlan[];
  readonly runs: readonly IncidentLabRun[];
  readonly digest: readonly string[];
}

const makeCatalogDigest = (
  scenarios: readonly IncidentLabScenario[],
  plans: readonly IncidentLabPlan[],
  runs: readonly IncidentLabRun[],
): string[] => [
  ...scenarios.map((scenario) => `${scenario.id}:${scenario.owner}:${scenario.topologyTags.length}`),
  ...plans.map((plan) => `${plan.id}:${plan.scenarioId}:${plan.selected.length}`),
  ...runs.map((run) => `${run.runId}:${run.state}:${run.results.length}`),
];

const pressureSummary = (scenario: IncidentLabScenario): number => {
  const graph = buildLabTopology(scenario.steps);
  const pressure = calculateNodePressure(graph);
  return Object.values(pressure).reduce((acc, current) => acc + current, 0);
}

export const useRecoveryLabCatalog = (repository: RecoveryIncidentLabRepository = new InMemoryRecoveryIncidentLabRepository()) => {
  const [state, setState] = useState<CatalogState>({
    scenarios: [],
    plans: [],
    runs: [],
    digest: [],
  });

  useEffect(() => {
    let active = true;
    const hydrate = async () => {
      const scenarioQuery = await repository.listScenarios();
      const planQuery = await repository.listPlansByScenario('');
      const runQuery = await repository.listRuns();

      const catalog = buildCatalog(
        scenarioQuery.items,
        planQuery.items,
        runQuery.items,
        [],
        {
          includeTelemetry: false,
          includeHistory: false,
        },
      );

      const filtered = findByOwner(catalog, 'SRE');
      const digest = makeCatalogDigest(filtered.scenarios.map((entry) => entry.entity), filtered.plans.map((entry) => entry.entity), filtered.runs.map((entry) => entry.entity));
      if (active) {
        setState({
          scenarios: filtered.scenarios.map((entry) => entry.entity),
          plans: filtered.plans.map((entry) => entry.entity),
          runs: filtered.runs.map((entry) => entry.entity),
          digest,
        });
      }
    };

    void hydrate().catch(() => undefined);
    return () => {
      active = false;
    };
  }, [repository]);

  const pressure = useMemo(() => {
    return state.scenarios.map((scenario) => ({
      scenarioId: scenario.id,
      score: pressureSummary(scenario),
    }));
  }, [state.scenarios]);

  return { state, pressure };
};
