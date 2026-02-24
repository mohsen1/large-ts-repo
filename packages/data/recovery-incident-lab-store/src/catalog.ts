import type { IncidentLabScenario, IncidentLabPlan, IncidentLabRun } from '@domain/recovery-incident-lab-core';
import type { LabStoreTelemetry, SnapshotFilter } from './types';

export interface CatalogItem<T> {
  readonly id: string;
  readonly entity: T;
  readonly tags: readonly string[];
}

export interface CatalogSnapshot {
  readonly scenarios: readonly CatalogItem<IncidentLabScenario>[];
  readonly plans: readonly CatalogItem<IncidentLabPlan>[];
  readonly runs: readonly CatalogItem<IncidentLabRun>[];
  readonly telemetry: readonly LabStoreTelemetry[];
}

export interface CatalogOptions {
  readonly includeTelemetry: boolean;
  readonly includeHistory: boolean;
}

const isAllowedFilter = (filter: SnapshotFilter | undefined): filter is SnapshotFilter =>
  filter == null || typeof filter === 'object';

const runId = (run: IncidentLabRun): string => run.runId;

export const createCatalogItem = <T>(id: string, entity: T, tags: readonly string[]): CatalogItem<T> => ({
  id,
  entity,
  tags,
});

const first = <T>(items: readonly T[]): T | undefined => items[0];
const byTag = (items: readonly string[]): readonly string[] => [...new Set(items)];

const describeScenario = (scenario: IncidentLabScenario): string =>
  `${scenario.id}:${scenario.owner}:${scenario.topologyTags.length}:${scenario.steps.length}`;
const describePlan = (plan: IncidentLabPlan): string =>
  `${plan.id}:${plan.scenarioId}:${plan.selected.length}`;

const findScenario = (scenarios: readonly IncidentLabScenario[], scenarioId: string): IncidentLabScenario | undefined =>
  scenarios.find((scenario) => scenario.id === scenarioId);

export const buildCatalog = (
  scenarios: readonly IncidentLabScenario[],
  plans: readonly IncidentLabPlan[],
  runs: readonly IncidentLabRun[],
  telemetry: readonly LabStoreTelemetry[],
  options: CatalogOptions,
  filter?: SnapshotFilter,
): CatalogSnapshot => {
  const isFilterValid = isAllowedFilter(filter);
  const include = isFilterValid ? filter : {};

  const filteredScenarios = include.scenarioId
    ? scenarios.filter((scenario) => scenario.id === include.scenarioId)
    : scenarios;

  const filteredPlans = include.scenarioId
    ? plans.filter((plan) => plan.scenarioId === include.scenarioId)
    : plans;

  const filteredRuns = include.scenarioId
    ? runs.filter((run) => run.scenarioId === include.scenarioId)
    : runs;

  const scenarioItems = filteredScenarios.map((scenario) =>
    createCatalogItem(
      scenario.id,
      scenario,
      byTag([scenario.severity, 'scenario', describeScenario(scenario)]),
    ),
  );

  const planItems = filteredPlans.map((plan) =>
    createCatalogItem(plan.id, plan, byTag([describePlan(plan), 'plan', plan.state])),
  );

  const runItems = filteredRuns.map((run) =>
    createCatalogItem(runId(run), run, byTag([run.state, `steps-${run.results.length}`])),
  );

  return {
    scenarios: scenarioItems,
    plans: planItems,
    runs: runItems,
    telemetry:
      options.includeTelemetry && options.includeHistory
        ? [...telemetry]
        : [],
  };
};

export const findByOwner = (
  snapshot: CatalogSnapshot,
  owner: string,
): CatalogSnapshot => ({
  ...snapshot,
  scenarios: snapshot.scenarios.filter((item) => item.entity.owner === owner),
  plans: snapshot.plans.filter((item) => item.entity.scheduledBy === owner),
  runs: snapshot.runs.filter((item) => item.entity.scenarioId.includes(owner) || item.id.includes(owner)),
  telemetry: snapshot.telemetry.filter((item) => item.scenarioCount > 0),
});

export const indexByScenario = (snapshot: CatalogSnapshot): Record<string, CatalogItem<IncidentLabScenario>> => {
  const map: Record<string, CatalogItem<IncidentLabScenario>> = {};
  for (const item of snapshot.scenarios) {
    map[item.entity.id] = item;
  }
  return map;
};

export const summarizeCatalog = (snapshot: CatalogSnapshot): string => {
  const scenario = first(snapshot.scenarios);
  const plan = first(snapshot.plans);
  const run = first(snapshot.runs);
  return `scenarios=${snapshot.scenarios.length} plans=${snapshot.plans.length} runs=${snapshot.runs.length} first=${scenario?.id}/${plan?.id}/${run?.id}`;
};

export const queryByState = (
  items: readonly IncidentLabRun[],
  state: IncidentLabRun['state'],
): readonly IncidentLabRun[] => items.filter((run) => run.state === state);

export const groupByScenario = <T extends { scenarioId: string }>(items: readonly T[]): Record<string, readonly T[]> => {
  const map: Record<string, T[]> = {};
  for (const item of items) {
    map[item.scenarioId] = [...(map[item.scenarioId] ?? []), item];
  }
  return map;
};

export const planScenario = (plans: readonly CatalogItem<IncidentLabPlan>[], scenarioId: string): CatalogItem<IncidentLabPlan>[] =>
  plans.filter((item) => item.entity.scenarioId === scenarioId);

export const runScenario = (runs: readonly CatalogItem<IncidentLabRun>[], scenarioId: string): CatalogItem<IncidentLabRun>[] =>
  runs.filter((item) => item.entity.scenarioId === scenarioId);

export const matchScenario = (scenarios: readonly IncidentLabScenario[], scenarioId: string): IncidentLabScenario | undefined =>
  findScenario(scenarios, scenarioId);
