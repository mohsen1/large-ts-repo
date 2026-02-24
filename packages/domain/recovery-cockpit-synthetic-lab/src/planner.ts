import { NoInfer } from '@shared/type-level';
import {
  blueprintByPhaseMatrix,
  estimateScenarioComplexity,
  phaseWeights,
  scenarioCatalogParsed,
  scenarioStepsByPhase,
  type ScenarioBlueprint,
  type ScenarioId,
  type ScenarioInput,
  type ScenarioOutput,
  type ScenarioPlan,
  type ScenarioRunConfig,
  type StepClass,
  scenarioStepSignature,
  asRunSignature,
  asScenarioId,
  asTenantId,
  TenantId,
} from './contracts';
import { runSyntheticScenario } from './registry';

export type PlanningRequest = {
  readonly scenario: ScenarioBlueprint;
  readonly actor: string;
  readonly dryRun: boolean;
  readonly mode: ScenarioRunConfig['mode'];
};

export type PlanTimelineRow = {
  readonly phase: StepClass;
  readonly at: string;
  readonly durationMinutes: number;
  readonly value: number;
};

export type PlanResult = {
  readonly request: PlanningRequest;
  readonly runId: string;
  readonly summary: ScenarioOutput;
  readonly timeline: readonly PlanTimelineRow[];
  readonly digest: string;
};

export type RankedPlan = {
  readonly id: ScenarioId;
  readonly severity: ScenarioBlueprint['severity'];
  readonly score: number;
  readonly digest: string;
};

type WeightedTuple<T extends readonly unknown[]> = {
  [K in keyof T]: T[K] & { readonly weighted: number };
};

const isTenantSeed = (tenant: TenantId): boolean => `${tenant}`.length > 0;

const computePlanScore = (scenario: ScenarioBlueprint): number => {
  const buckets = scenarioStepsByPhase(scenario);
  return [...Object.entries(buckets)]
    .map(([phase, entries]) => {
      const parsed = phase as StepClass;
      const value = entries.reduce((acc, step) => acc + step.durationMinutes * (phaseWeights[parsed] ?? 0), 0);
      return {
        phase: parsed,
        value,
      };
    })
    .reduce((acc, entry) => acc + entry.value, 0);
};

export const planTimeline = (scenario: ScenarioBlueprint): readonly PlanTimelineRow[] =>
  [...scenario.steps]
    .toSorted((left, right) => left.durationMinutes - right.durationMinutes)
    .map((step, index) => ({
      phase: step.className,
      at: new Date(Date.now() + index * 60_000).toISOString(),
      durationMinutes: step.durationMinutes,
      value: step.durationMinutes * (phaseWeights[step.className] ?? 0),
    }));

export const buildScenarioPlan = (scenario: ScenarioBlueprint): ScenarioPlan => {
  const bucketed = scenarioStepsByPhase(scenario);
  const score = computePlanScore(scenario);
  return {
    id: asScenarioId(`${scenario.id}`),
    severity: scenario.severity,
    tenant: asTenantId(`${scenario.tenant}`),
    steps: [...scenario.steps].toSorted((left, right) => left.durationMinutes - right.durationMinutes),
    score,
    signature: asRunSignature(`${scenarioStepSignature(scenario.steps)}`),
    tags: scenarioBlueprintTags(scenario),
    startedAt: new Date().toISOString(),
  };
};

export const summarizeByPhase = (scenario: ScenarioBlueprint) => {
  const buckets = scenarioStepsByPhase(scenario);
  return {
    assess: buckets.assess.length,
    simulate: buckets.simulate.length,
    actuate: buckets.actuate.length,
    verify: buckets.verify.length,
  };
};

export const withPlanWeights = <T extends readonly [ScenarioBlueprint, ...ScenarioBlueprint[]]>(
  values: T,
  weights: readonly number[] = [0.45, 0.25, 0.2, 0.1],
): WeightedTuple<T> =>
  values.map((entry, index) => ({
    ...entry,
    weighted: weights[index] ?? 1 / Math.max(1, values.length),
  })) as unknown as WeightedTuple<T>;

const scenarioBlueprintTags = (scenario: ScenarioBlueprint): readonly `${string}:scenario`[] =>
  [
    ...new Set<string>([
      `tenant:${scenario.tenant}`,
      `region:${scenario.region}`,
      `${scenario.id}:scenario`,
      ...scenario.metrics.map((metric) => `${metric.key}:${metric.unit}:scenario`),
    ]),
  ].map((tag) => `${tag}` as `${string}:scenario`);

export const computePlanDigest = (request: PlanningRequest): string => {
  const counts = summarizeByPhase(request.scenario);
  const matrix = blueprintByPhaseMatrix(request.scenario);
  return `${request.scenario.id}-${counts.assess}-${counts.simulate}-${counts.actuate}-${counts.verify}-${scenarioStepSignature(request.scenario.steps)}-${matrix.assess}-${matrix.simulate}-${matrix.actuate}-${matrix.verify}`;
};

export const executePlan = async (request: PlanningRequest): Promise<PlanResult> => {
  const completion = await runSyntheticScenario(
    {
      mode: request.mode,
      actor: request.actor,
      weights: {
        dryRun: request.dryRun,
      },
    },
    request.scenario,
    {
      input: request.scenario.id,
      requestedBy: request.actor,
      context: {
        actor: request.actor,
        mode: request.mode,
      },
    },
  );

  return {
    request,
    runId: `${completion.envelope.id}`,
    summary: completion.completion.payload,
    timeline: planTimeline(request.scenario),
    digest: `${computePlanDigest(request)}`,
  };
};

export async function* executeBatchPlans(requests: readonly PlanningRequest[]): AsyncGenerator<PlanResult> {
  for (const request of requests) {
    yield await executePlan(request);
  }
}

export const rankPlans = <TBlueprints extends readonly ScenarioBlueprint[]>(
  scenarios: TBlueprints,
  scores: readonly number[],
): readonly RankedPlan[] =>
  scenarios
    .map((scenario, index) => ({
      id: asScenarioId(`${scenario.id}`),
      severity: scenario.severity,
      score: scores[index] ?? 0,
      digest: `${computePlanDigest({
        scenario,
        actor: `rank:${scenario.id}`,
        dryRun: true,
        mode: 'simulate',
      })}`,
    }))
    .toSorted((left, right) => right.score - left.score);

export const buildScenarioCatalog = (): readonly ScenarioBlueprint[] =>
  scenarioCatalogParsed.toSorted(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );

export const createPlanMatrix = (scenarios: readonly ScenarioBlueprint[]) => {
  const matrix = new Map<string, readonly PlanTimelineRow[]>();
  for (const scenario of scenarios) {
    matrix.set(scenario.id, planTimeline(scenario));
  }
  return {
    map: matrix,
    keyed: matrix,
  };
};

export const deriveRanking = (scenarios: readonly ScenarioBlueprint[]) => {
  const sorted = [...scenarios].toSorted((left, right) => right.severity.localeCompare(left.severity));
  const weighted = withPlanWeights(sorted as [ScenarioBlueprint, ...ScenarioBlueprint[]]);
  const scores = weighted.map((plan) => 1 / Math.max(1, plan.steps.length));
  return rankPlans(weighted, scores);
};

export const scenarioDigestCache = (scenarios: readonly ScenarioBlueprint[]) =>
  weightedTupleKey(scenarios.map((scenario) => scenario.id), scenarios.map((scenario) => scenario.tenant));

const weightedTupleKey = (ids: readonly string[], tenants: readonly string[]): string =>
  `${ids.length}:${tenants.length}:${ids.join('|')}`;

export const rankedPlanMatrix = <const TBlueprints extends readonly [ScenarioBlueprint, ...ScenarioBlueprint[]]>(
  scenarios: TBlueprints,
  scoreSeed: NoInfer<readonly number[]> = [],
) => ({
  ranked: rankPlans(scenarios, scoreSeed),
  weighted: withPlanWeights(scenarios),
  key: weightedTupleKey(scenarios.map((scenario) => scenario.id), scenarios.map((scenario) => scenario.tenant)),
  isTenantValid: isTenantSeed(asTenantId(scenarios[0]!.tenant)),
} as const);

export const runTenantPlans = async (tenant: TenantId, actor: string, mode: ScenarioRunConfig['mode']) => {
  const tenantValue = `${tenant}`;
  const scenarios = buildScenarioCatalog().filter((scenario) => scenario.tenant === tenantValue);
  const requests = scenarios.map((scenario, index) => ({
    scenario,
    actor,
    dryRun: index % 2 === 0,
    mode,
  }));

  const outputs: PlanResult[] = [];
  for await (const result of executeBatchPlans(requests)) {
    outputs.push(result);
  }
  return outputs;
};
