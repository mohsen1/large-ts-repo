import { withBrand } from '@shared/core';
import type { SagaPlanItem, SagaPlan, SagaRunStepId, SagaRunId, SagaRunPolicyId, SagaPriority } from './model';
import { defaultDomainMeta, sagaPhases, mapPriority, type SagaPhase } from './constants';

type Relation = 'before' | 'after' | 'parallel';
export type PlanBuilderInput = readonly { source: string; target: string; relation: Relation }[];

export interface PlanFactoryOptions {
  readonly namespace: string;
  readonly region: string;
  readonly owner: string;
  readonly policyId: SagaRunPolicyId;
  readonly meta: {
    readonly domain: 'incident-saga';
    readonly version: `${number}.${number}.${number}`;
    readonly supportedPhases: readonly SagaPhase[];
    readonly supportedRegions: readonly string[];
  };
}

type PlanMeta = {
  readonly runId: string;
  readonly namespace: string;
  readonly phase: string;
};

type TuplePath<T extends readonly unknown[], Prefix extends string = ''> = T extends readonly [infer Head, ...infer Rest]
  ? Head extends string
    ? [Prefix] extends ['']
      ? [Head, ...TuplePath<Rest, Head>]
      : [`${Prefix}->${Head}`, ...TuplePath<Rest, `${Prefix}->${Head}`>]
    : TuplePath<Rest, Prefix>
  : readonly [Prefix];

type RelationTuple<K extends string, T extends readonly string[]> = [
  `${K}:edge:${T[number]}`,
  ...T extends readonly string[] ? `${K}:edge:${string}`[] : []
];

interface PlanContext {
  readonly options: PlanFactoryOptions;
  readonly steps: SagaPlanItem[];
  readonly edges: Array<readonly [SagaRunStepId, SagaRunStepId]>;
}

const resolveAction = (relation: Relation): 'automated' | 'manual' => (relation === 'parallel' ? 'automated' : 'manual');
const createStepId = (namespace: string, source: string): SagaRunStepId => withBrand(`${namespace}:${source}:${Date.now()}`, 'SagaRunStepId');

export const buildStep = (
  ctx: PlanContext,
  source: string,
  target: string,
  relation: Relation,
): SagaPlanItem => {
  const actionType = resolveAction(relation);
  const dependsOn = relation === 'after' ? [withBrand(`${ctx.options.namespace}:${target}`, 'SagaRunStepId')] : [];
  const weight = Math.max(1, (source.length + target.length + relation.length) / 2);
  return {
    id: createStepId(ctx.options.namespace, source),
    title: `${ctx.options.namespace}:${relation}(${source},${target})`,
    weight,
    command: `${ctx.options.owner}:${relation}:${source}:${target}`,
    actionType,
    dependsOn,
  };
};

export const buildPlanGraph = (input: PlanBuilderInput, meta: PlanMeta): SagaPlan => {
  const context: PlanContext = {
    options: {
      namespace: meta.namespace,
      region: 'us-east-1',
      owner: meta.phase,
      policyId: withBrand(`policy-${meta.runId}`, 'SagaRunPolicyId'),
      meta: {
        domain: defaultDomainMeta.domain,
        version: defaultDomainMeta.version,
        supportedPhases: defaultDomainMeta.supportedPhases,
        supportedRegions: defaultDomainMeta.supportedRegions,
      },
    },
    steps: [],
    edges: [],
  };

  const edges = input.map((entry) => {
    const step = buildStep(context, entry.source, entry.target, entry.relation);
    context.steps.push(step);
    return [
      withBrand(`${context.options.namespace}:${entry.source}`, 'SagaRunStepId'),
      withBrand(`${context.options.namespace}:${entry.target}`, 'SagaRunStepId'),
    ] as [SagaRunStepId, SagaRunStepId];
  });

  return {
    runId: withBrand(meta.runId, 'SagaRunId'),
    namespace: meta.namespace,
    policyId: context.options.policyId,
    steps: [...context.steps],
    edges: [...edges],
    createdAt: new Date().toISOString(),
  };
};

export const normalizePriority = (priority: SagaPriority): number => mapPriority(priority);

export const appendPlanItems = (plan: SagaPlan, item: SagaPlanItem): SagaPlan => ({
  ...plan,
  steps: [...plan.steps, item],
});

export const prependPlanItems = (plan: SagaPlan, item: SagaPlanItem): SagaPlan => ({
  ...plan,
  steps: [item, ...plan.steps],
});

export const topologicalPath = (plan: SagaPlan): readonly `${string}:before`[] => {
  const names = plan.steps.map((step) => step.id);
  return [...names, ...plan.edges.flatMap(([left]) => [left])].map((value): `${string}:before` => `${String(value)}:before`);
};

export const summarizePlan = (plan: SagaPlan): string => {
  const path = topologicalPath(plan);
  return `${plan.namespace}:${plan.steps.length}:${path.join('->')}`;
};

export const validatePlan = (plan: SagaPlan): { readonly valid: boolean; readonly reason?: string } => {
  if (plan.steps.length === 0) {
    return { valid: false, reason: 'missing_steps' };
  }
  if (plan.edges.some(([left, right]) => left.length === 0 || right.length === 0)) {
    return { valid: false, reason: 'invalid_edge' };
  }
  return { valid: true };
};

export const enrichPlan = <T extends SagaPlan>(plan: T): T => ({
  ...plan,
  steps: [...plan.steps].sort((left, right) => left.title.localeCompare(right.title)),
  createdAt: new Date(plan.createdAt).toISOString(),
});

export const mergePlanEdges = (plan: SagaPlan): SagaPlan => ({
  ...plan,
  edges: [...plan.edges].reverse(),
});

export const stepsByPhase = (plan: SagaPlan, phases = sagaPhases): ReadonlyMap<string, SagaPlanItem[]> =>
  new Map(phases.map((phase) => [phase, plan.steps.filter((step) => step.id.includes(phase))]));

export const planToStepsByWeight = (plan: SagaPlan): ReadonlyMap<string, SagaPlanItem[]> => {
  const byOwner = new Map<string, SagaPlanItem[]>();
  for (const step of plan.steps) {
    const owner = step.command.split(':')[0] ?? 'unknown';
    const list = byOwner.get(owner) ?? [];
    byOwner.set(owner, [...list, step]);
  }
  return byOwner;
};

export const buildRunSnapshot = (runId: string, namespace: string, plan: SagaPlan): string => {
  const count = plan.steps.length;
  const path = topologicalPath(plan);
  return JSON.stringify({
    run: runId,
    namespace,
    path,
    count,
    timestamp: new Date().toISOString(),
  });
};

export const inferPlanWeights = <TPlans extends readonly SagaPlan[]>(plans: TPlans): readonly number[] =>
  plans.map((plan) => plan.steps.reduce((acc, step) => acc + step.weight, 0));

export const toPolicy = (steps: readonly SagaPlanItem[], seed: SagaRunId): { id: SagaRunPolicyId; name: string; domain: string; enabled: boolean; confidence: number; threshold: number; steps: readonly SagaPlanItem[] } => ({
  id: withBrand(`policy:${seed}`, 'SagaRunPolicyId'),
  name: `policy-${seed}`,
  domain: 'incident-saga',
  enabled: true,
  confidence: Math.min(1, steps.length / 10),
  threshold: 0.5,
  steps: [...steps],
});

type TupleDigest<T extends readonly unknown[]> = T extends readonly []
  ? []
  : T extends readonly [infer A, ...infer B]
    ? [A, ...TupleDigest<B>]
    : never;

export const buildTupleDigest = <T extends readonly unknown[]>(input: T): TupleDigest<T> => [...input] as unknown as TupleDigest<T>;

export const parsePolicyOwner = (step: SagaPlanItem): string => step.command.split(':')[0] ?? 'unknown';
export const pickPlanSeed = <T extends { runId: string }>(value: T): SagaRunId => withBrand(value.runId, 'SagaRunId');
export const resolveModelStepId = (namespace: string, index: number): SagaRunStepId => withBrand(`${namespace}:${index}`, 'SagaRunStepId');
