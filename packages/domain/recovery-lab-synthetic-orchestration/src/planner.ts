import { ratio } from '@shared/lab-graph-runtime';
import { type GraphStep, type GraphRunId, type NodeId, type WorkspaceState, type PlanSnapshot, makeRunId } from './models.js';

export interface PlannerInput<TNamespace extends string = string> {
  readonly tenant: string;
  readonly namespace: TNamespace;
  readonly planId: GraphRunId;
  readonly rawSteps: readonly GraphStep<TNamespace>[];
  readonly nodes: readonly { id: NodeId; type: string; route: string; tags: readonly string[] }[];
}

export interface PlanDraft<TNamespace extends string = string> {
  readonly namespace: `recovery.${TNamespace}`;
  readonly runId: GraphRunId;
  readonly tenant: string;
  readonly steps: readonly GraphStep<TNamespace>[];
  readonly routeCoverage: ReadonlyMap<string, number>;
  readonly risk: number;
}

type StepTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? Tail extends readonly unknown[]
    ? [Head, ...StepTuple<Tail>]
    : [Head]
  : [];

export const DEFAULT_PROFILE = {
  riskThreshold: 0.65,
  maxRuntimeMs: 120000,
  maxConcurrency: 3,
} as const;

const dedupeById = <T extends { id: string }>(values: readonly T[]): readonly T[] => {
  const index = new Map<string, T>();
  for (const value of values) {
    index.set(value.id, value);
  }
  return [...index.values()];
};

export const stepTuple = <T extends readonly GraphStep<string>[]>(steps: T): StepTuple<T> => {
  return steps as unknown as StepTuple<T>;
};

export const planRisk = (steps: readonly GraphStep<string>[]): number => {
  if (steps.length === 0) return 0;
  const risks = steps.map((step) => {
    switch (step.intensity) {
      case 'extreme':
        return 1;
      case 'elevated':
        return 0.5;
      default:
        return 0.1;
    }
  });
  return risks.reduce((total, value) => total + value, 0) / risks.length;
};

export const estimateRisk = planRisk;

export const groupByPhase = (steps: readonly GraphStep<string>[]): ReadonlyMap<string, readonly GraphStep<string>[]> => {
  const byPhase = new Map<string, GraphStep<string>[]>();
  for (const step of steps) {
    const next = byPhase.get(step.phase) ?? [];
    byPhase.set(step.phase, [...next, step]);
  }
  return byPhase;
};

const routeFromPhase = <TNamespace extends string>(
  namespace: TNamespace,
  phase: string,
): `recovery.${TNamespace}:${string}` => `recovery.${namespace}:${phase}`;

const phaseBuckets = (steps: readonly GraphStep<string>[]): ReadonlyMap<string, readonly GraphStep<string>[]> => {
  const byPhase = new Map<string, GraphStep<string>[]>();
  for (const step of steps) {
    const next = byPhase.get(step.phase) ?? [];
    byPhase.set(step.phase, [...next, step]);
  }
  return byPhase;
};

export const makeDraft = <TNamespace extends string>({
  tenant,
  namespace,
  planId,
  rawSteps,
}: PlannerInput<TNamespace>): PlanDraft<TNamespace> => {
  const normalized = dedupeById(rawSteps).map((step) => ({
    ...step,
    phase: routeFromPhase(namespace, step.phase),
  }));
  const sorted = [...normalized].sort((left, right) => left.estimatedMs - right.estimatedMs);
  const routeCoverage = new Map<string, number>();
  for (const [route, entries] of phaseBuckets(sorted).entries()) {
    routeCoverage.set(route, entries.length);
  }
  return {
    namespace: `recovery.${namespace}`,
    runId: planId,
    tenant,
    steps: sorted,
    routeCoverage,
    risk: planRisk(sorted),
  };
};

export const enrichDraft = <TNamespace extends string>(
  draft: PlanDraft<TNamespace>,
): PlanDraft<TNamespace> & { readonly labels: ReadonlyMap<string, string> } => {
  const labels = new Map<string, string>([
    ['tenant', draft.tenant],
    ['namespace', draft.namespace],
    ['stepCount', `${draft.steps.length}`],
  ]);
  return {
    ...draft,
    labels,
    risk: ratio(draft.steps.length, draft.steps.length + 1) * draft.risk,
  };
};

export const enumerateBuckets = <TStep extends readonly GraphStep<string>[], TBucket extends number>(
  steps: TStep,
  batchSize: TBucket,
): readonly ReadonlyArray<TStep[number]>[] => {
  const output: ReadonlyArray<TStep[number]>[] = [];
  if (batchSize <= 0) return output;
  for (let index = 0; index < steps.length; index += batchSize) {
    output.push(steps.slice(index, index + batchSize));
  }
  return output;
};

export interface BlueprintEnvelopeInput {
  readonly tenant: string;
  readonly namespace: string;
}

export const sanitizeDraftId = (namespace: string, tenant: string): GraphRunId =>
  makeRunId(`${tenant}::${namespace}::${Date.now()}`);
