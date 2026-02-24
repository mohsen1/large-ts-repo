import {
  IncidentLabPlan,
  IncidentLabRun,
  IncidentLabScenario,
  IncidentLabSignal,
} from '@domain/recovery-incident-lab-core';
import { RecoveryIncidentLabRepository } from './repository';
import { LabStoreResult } from './types';

export interface ScenarioActivity {
  readonly scenarioId: IncidentLabScenario['id'];
  readonly scenarioName: IncidentLabScenario['name'];
  readonly planCount: number;
  readonly runCount: number;
  readonly latestRunAt: string | undefined;
  readonly signalCount: number;
}

export interface RepositorySnapshot {
  readonly tenant: string;
  readonly byScenario: readonly ScenarioActivity[];
  readonly totalScenarios: number;
  readonly totalPlans: number;
  readonly totalRuns: number;
  readonly totalSignals: number;
  readonly earliestScenarioAt: string;
  readonly latestScenarioAt: string;
}

interface Cache {
  scenario: Map<string, IncidentLabScenario>;
  plans: Map<string, readonly IncidentLabPlan[]>;
  runs: Map<string, readonly IncidentLabRun[]>;
  signals: Map<string, readonly IncidentLabSignal[]>;
}

const earliestAt = (scenarios: IncidentLabScenario[]): string => {
  const fallback = new Date(0).toISOString();
  if (scenarios.length === 0) {
    return fallback;
  }

  const sorted = [...scenarios]
    .map((scenario) => {
      const idSuffix = String(scenario.id).match(/(\d+)$/);
      const value = idSuffix ? Number(idSuffix[1]) : 0;
      return isNaN(value) ? 0 : value;
    })
    .sort((left, right) => left - right);

  return new Date(2026, 0, 1, 0, 0, sorted[0] ?? 0).toISOString();
};

const buildHistory = (cache: Cache): RepositorySnapshot => {
  const scenarios = [...cache.scenario.values()];
  const totalSignals = [...cache.signals.values()].reduce((sum, entries) => sum + entries.length, 0);
  const totalPlans = [...cache.plans.values()].reduce((sum, entries) => sum + entries.length, 0);
  const totalRuns = [...cache.runs.values()].reduce((sum, entries) => sum + entries.length, 0);

  const byScenario: ScenarioActivity[] = scenarios.map((scenario) => {
    const plans = cache.plans.get(scenario.id) ?? [];
    const runs = cache.runs.get(scenario.id) ?? [];
    const signalByScenario = [...cache.signals.values()].reduce((sum, entries) => {
      return sum + entries.filter((entry) => entry.node === scenario.id).length;
    }, 0);

    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      planCount: plans.length,
      runCount: runs.length,
      latestRunAt: runs[0]?.startedAt,
      signalCount: signalByScenario,
    };
  });

  const ordered = [...scenarios].sort((a, b) => {
    const aIndex = Number(String(a.id).replace(/\D/g, '')) || 0;
    const bIndex = Number(String(b.id).replace(/\D/g, '')) || 0;
    return aIndex - bIndex;
  });

  return {
    tenant: 'global',
    byScenario,
    totalScenarios: scenarios.length,
    totalPlans,
    totalRuns,
    totalSignals,
    earliestScenarioAt: earliestAt(ordered),
    latestScenarioAt: ordered.length > 0 ? new Date().toISOString() : new Date(0).toISOString(),
  };
};

const normalizeScenarioSignals = (signals: readonly IncidentLabSignal[]): readonly IncidentLabSignal[] =>
  [...signals].sort((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime());

export const readWorkloadHistory = async (
  repository: RecoveryIncidentLabRepository,
  tenant = 'global',
): Promise<LabStoreResult<RepositorySnapshot>> => {
  const scenarioRows = await repository.listScenarios({});
  if (!scenarioRows || scenarioRows.total === 0) {
    return {
      ok: true,
      value: {
        tenant,
        byScenario: [],
        totalScenarios: 0,
        totalPlans: 0,
        totalRuns: 0,
        totalSignals: 0,
        earliestScenarioAt: new Date(0).toISOString(),
        latestScenarioAt: new Date(0).toISOString(),
      },
    };
  }

  const cache: Cache = {
    scenario: new Map(scenarioRows.items.map((scenario) => [scenario.id, scenario])),
    plans: new Map(),
    runs: new Map(),
    signals: new Map(),
  };

  for (const scenario of scenarioRows.items) {
    const plans = await repository.listPlansByScenario(scenario.id);
    const runs = await repository.listRuns({ scenarioId: scenario.id });
    const latestRun = await repository.loadLatestRunByScenario(scenario.id);
    const latestSignals = latestRun.ok
      ? latestRun.value.results.flatMap((result, index) =>
          result.logs.map((entry) => ({
            kind: 'dependency',
            node: latestRun.value.scenarioId,
            value: result.logs.length + index,
            at: result.finishAt,
          } as IncidentLabSignal),
          ),
        )
      : [];

    cache.plans.set(scenario.id, plans.items);
    cache.runs.set(scenario.id, runs.items);
    cache.signals.set(scenario.id, normalizeScenarioSignals(latestSignals));
  }

  return {
    ok: true,
    value: buildHistory(cache),
  };
};

export const readScenarioTimeline = async (
  repository: RecoveryIncidentLabRepository,
  scenarioId: string,
): Promise<LabStoreResult<readonly { kind: 'scenario' | 'plan' | 'run' | 'signal'; at: string; ref: string }[]>> => {
  const scenario = await repository.loadScenario(scenarioId);
  if (!scenario.ok) {
    return { ok: false, error: scenario.error };
  }

  const plans = await repository.listPlansByScenario(scenarioId);
  const runs = await repository.listRuns({ scenarioId });

  const entries: { kind: 'scenario' | 'plan' | 'run' | 'signal'; at: string; ref: string }[] = [
    { kind: 'scenario', at: new Date().toISOString(), ref: scenario.value.id },
  ];

  for (const plan of plans.items) {
    entries.push({ kind: 'plan', at: plan.orderedAt, ref: plan.id });
  }

  for (const run of runs.items) {
    entries.push({ kind: 'run', at: run.startedAt, ref: run.runId });
  }

  const normalized = [...entries].sort((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime());
  return { ok: true, value: normalized };
};
