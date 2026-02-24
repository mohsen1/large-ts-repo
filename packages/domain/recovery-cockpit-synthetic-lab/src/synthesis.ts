import { NoInfer } from '@shared/type-level';
import {
  phaseWeights,
  scenarioCatalogParsed,
  scenarioStepsByPhase,
  type ScenarioBlueprint,
  type ScenarioInput,
  type ScenarioRunConfig,
  type ScenarioId,
  type ScenarioPlan,
  type TenantId,
  type StepClass,
} from './contracts';
import { executePlan, executeBatchPlans, buildScenarioPlan, PlanResult, PlanningRequest } from './planner';
import { runSyntheticScenario, streamSyntheticScenario } from './registry';

export const syntheticCatalogReady = scenarioCatalogParsed;

export type SyntheticScenarioEnvelope = {
  readonly tenant: TenantId;
  readonly catalogSize: number;
  readonly signatures: readonly ScenarioPlan[];
};

export type ScenarioResultSet = {
  readonly request: PlanningRequest;
  readonly result: PlanResult;
};

export type CatalogDigest = {
  readonly tenant: TenantId;
  readonly digest: string;
  readonly score: number;
};

export const scenarioCatalogEnvelope = (tenant: TenantId): SyntheticScenarioEnvelope => ({
  tenant,
  catalogSize: syntheticCatalogByTenant(tenant).length,
  signatures: syntheticCatalogByTenant(tenant).map((scenario) => buildScenarioPlan(scenario)),
});

export const syntheticCatalogByTenant = (tenant: TenantId): readonly ScenarioBlueprint[] =>
  syntheticCatalogReady.filter((scenario) => scenario.tenant === tenant);

export const syntheticCatalogTenants = (): readonly TenantId[] =>
  [...new Set(syntheticCatalogReady.map((scenario) => scenario.tenant))] as readonly TenantId[];

export const buildCatalogDigest = (tenant: TenantId): CatalogDigest => {
  const scenarios = syntheticCatalogByTenant(tenant);
  const signature = scenarios
    .map((scenario) => `${scenario.id}:${scenario.steps.length}:${scenario.metrics.length}`)
    .join('|');
  const score = scenarios.reduce((acc, scenario) => acc + scenario.steps.length, 0);
  return {
    tenant,
    digest: signature,
    score,
  };
};

export const syntheticPlanWeights = (tenant: TenantId): Record<StepClass, number> =>
  Object.fromEntries(
    Object.entries(phaseWeights).map(([phase, weight]) => {
      const phaseRows = syntheticCatalogByTenant(tenant).flatMap((scenario) =>
        scenario.steps.filter((step) => step.className === phase),
      );
      return [
        phase,
        phaseRows.length === 0 ? 0 : Number((weight * phaseRows.length).toFixed(4)),
      ];
    }),
  ) as Record<StepClass, number>;

export const runTenantSuite = async (tenant: TenantId, actor: string, mode: ScenarioRunConfig['mode']): Promise<ScenarioResultSet[]> => {
  const scenarios = syntheticCatalogByTenant(tenant);
  const requests = scenarios.map((scenario, index) => ({
    scenario,
    actor,
    dryRun: index % 2 === 0,
    mode,
  }));
  const outputs: ScenarioResultSet[] = [];
  for await (const result of executeBatchPlans(requests)) {
    outputs.push({ request: result.request, result });
  }
  return outputs;
};

export const runSingleScenario = async (
  scenario: ScenarioBlueprint,
  mode: ScenarioRunConfig['mode'],
  actor: string,
): Promise<ScenarioResultSet> => {
  const request: PlanningRequest = {
    scenario,
    actor,
    dryRun: true,
    mode,
  };
  const result = await executePlan(request);
  return {
    request,
    result,
  };
};

export const streamScenario = async (scenario: ScenarioBlueprint, actor: string): Promise<ScenarioResultSet['result']> => {
  const completion = await runSyntheticScenario(
    {
      mode: 'simulate',
      actor,
      weights: { stream: true },
    },
    scenario,
    {
      input: scenario.id,
      requestedBy: actor,
      context: {
        actor,
        mode: 'simulate',
      },
    },
  );
  return {
    request: {
      scenario,
      actor,
      dryRun: true,
      mode: 'simulate',
    },
    runId: `${completion.envelope.id}`,
    summary: completion.completion.payload,
    timeline: completion.completion.phase !== 'verify' ? [] : [],
    digest: `${completion.envelope.digest}`,
  };
};

export const inspectStreams = async (scenario: ScenarioBlueprint, actor: string) => {
  const frames = await streamSyntheticScenario(scenario, { mode: 'simulate', actor, weights: { inspect: true } }, {
    input: scenario.id,
    requestedBy: actor,
    context: { actor, mode: 'simulate' },
  });
  const labels = frames.flatMap((frame) =>
    frame.type === 'progress'
      ? [`${frame.pluginId}`, `${frame.phase}`]
      : [`${frame.type}`, `${frame.phase}`],
  );
  return labels.toReversed().toSorted((left, right) => left.localeCompare(right));
};

export const planSignatureMatrix = (tenant: TenantId): readonly string[] =>
  syntheticCatalogByTenant(tenant)
    .map((scenario) => buildScenarioPlan(scenario).signature)
    .toSorted();

export const tenantScoreVector = (tenant: TenantId, mode: ScenarioRunConfig['mode']): readonly [ScenarioId, number][] =>
  syntheticCatalogByTenant(tenant).map((scenario) => {
    const plan = buildScenarioPlan(scenario);
    const buckets = scenarioStepsByPhase(scenario);
    const score = Object.values(buckets).reduce((acc, entries) => acc + entries.length, 0) * (mode === 'simulate' ? 2 : 1);
    return [plan.id, score];
  });

export const planTuple = <const TBlueprints extends readonly [ScenarioBlueprint, ...ScenarioBlueprint[]]>(
  scenarios: TBlueprints,
) =>
  scenarios.map((scenario) => [scenario.id, scenario.steps.length] as const) as {
    [K in keyof TBlueprints]: readonly [ScenarioId, number];
  };

export const catalogAudit = async (tenant: TenantId, actor: string): Promise<Record<string, string>> => {
  const records = tenantScoreVector(tenant, 'simulate');
  const streamSignals = await Promise.all(
    syntheticCatalogByTenant(tenant).map((scenario) =>
      inspectStreams(scenario, actor).then((entries) => entries.join(',')),
    ),
  );

  const output: Record<string, string> = {};
  for (const [index, [id]] of records.entries()) {
    const score = records[index]?.[1] ?? 0;
    output[id] = `${streamSignals[index] ?? ''}::score:${score}`;
  }

  return output;
};
