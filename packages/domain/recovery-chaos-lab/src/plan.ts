import { type StageBoundary } from './types';
import {
  type ChaosNamespace,
  type ChaosStatus,
  type ChaosTag,
  type EpochMs,
  type RunId,
  type ScenarioId,
  asRunId
} from './types';

export type PlanNoInfer<T> = [T][T extends infer U ? 0 : never];

export type StepName<T extends string> = `${T & string}`;
export type StageId<T extends string = string> = `${T & string}::stage`;
export type TimelineBucket = `${'pre' | 'mid' | 'post'}-${'s' | 'm' | 'h'}`;
export type ProgressVector<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? readonly [Head, ...ProgressVector<Tail>]
  : readonly [];

export type PlanStageInputs<T extends readonly StageBoundary<string, unknown, unknown>[]> = {
  [Index in keyof T]: T[Index] extends StageBoundary<string, infer Input, unknown>
    ? Input
    : never;
};

export type PlanStageOutputs<T extends readonly StageBoundary<string, unknown, unknown>[]> = {
  [Index in keyof T]: T[Index] extends StageBoundary<string, unknown, infer Output>
    ? Output
    : never;
};

export type InferPlanStageName<T> = T extends StageBoundary<infer Name, unknown, unknown> ? Name : never;

export type PlanStepIndex<T extends readonly StageBoundary<string, unknown, unknown>[]> = {
  [K in T[number]['name'] as `${K & string}Step`]: Extract<
    T[number],
    { name: K }
  >;
};

export interface ChaosPlanContext<TNamespace extends ChaosNamespace, TScenario extends ScenarioId> {
  readonly namespace: TNamespace;
  readonly scenarioId: TScenario;
  readonly requestedBy: string;
  readonly startedAt: EpochMs;
}

export interface ChaosRunEnvelope<
  TNamespace extends ChaosNamespace,
  TScenario extends ScenarioId,
  TStages extends readonly StageBoundary<string, unknown, unknown>[]
> {
  readonly namespace: TNamespace;
  readonly scenarioId: TScenario;
  readonly runId: RunId;
  readonly stages: TStages;
  readonly tags: readonly ChaosTag[];
  readonly context: ChaosPlanContext<TNamespace, TScenario>;
  readonly planVersion: `${number}.${number}.${number}`;
  readonly status: ChaosStatus;
}

export interface ChaosPlanSlice<
  TName extends string,
  TInput,
  TOutput
> {
  readonly sliceId: StageId<TName>;
  readonly stageName: TName;
  readonly weight: number;
  readonly estimatedDurationMs: number;
  readonly requires?: readonly StageId[];
  readonly payload: TInput;
  readonly output?: TOutput;
}

export type SliceSequence<T extends readonly StageBoundary<string, unknown, unknown>[]> = {
  [K in keyof T]: T[K] extends StageBoundary<infer Name, infer Input, infer Output>
    ? ChaosPlanSlice<Name, Input, Output>
    : never;
};

export interface PlanValidationIssue {
  readonly code: 'invalid-order' | 'missing-stage' | 'invalid-weight' | 'unknown-tag';
  readonly stage?: string;
  readonly detail: string;
}

export interface ChaosPlan<T extends readonly StageBoundary<string, unknown, unknown>[]> {
  readonly scenarioId: ScenarioId;
  readonly namespace: ChaosNamespace;
  readonly stages: T;
  readonly slices: SliceSequence<T>;
  readonly timelineBuckets: readonly TimelineBucket[];
  readonly createdAt: EpochMs;
  readonly updatedAt: EpochMs;
}

export interface ChaosPlanTemplate<
  TNamespace extends ChaosNamespace,
  TScenario extends ScenarioId,
  TStages extends readonly StageBoundary<string, unknown, unknown>[]
> {
  readonly namespace: TNamespace;
  readonly scenarioId: TScenario;
  readonly stages: TStages;
  readonly tags: readonly ChaosTag[];
  readonly timelineBuckets?: readonly TimelineBucket[];
  readonly weightByStage?: Partial<Record<TStages[number]['name'], number>>;
}

type BucketFromWindow<TWindow extends `${number}${'s' | 'm' | 'h'}`> = TWindow extends `${infer Amount extends number}${infer Unit extends 's' | 'm' | 'h'}` ? {
  readonly amount: Amount;
  readonly unit: Unit;
} : never;

export type PlanWindow = BucketFromWindow<'5m'>;

export type WeightedPlanSequence<
  TStages extends readonly StageBoundary<string, unknown, unknown>[],
  TWeights extends readonly number[]
> = TStages extends readonly [
  infer Head extends StageBoundary<string, unknown, unknown>,
  ...infer Tail extends readonly StageBoundary<string, unknown, unknown>[]
]
  ? Tail['length'] extends TWeights['length']
    ? readonly [
        ChaosPlanSlice<Head['name'], Head['input'], Head['output']>,
        ...WeightedPlanSequence<Tail, TailWeights<TWeights>>
      ]
    : readonly []
  : readonly [];

type TailWeights<TWeights extends readonly number[]> = TWeights extends readonly [
  number,
  ...infer Tail extends readonly number[]
]
  ? Tail
  : readonly [];

export function buildChaosPlan<
  TNamespace extends ChaosNamespace,
  TScenario extends ScenarioId,
  TStages extends readonly StageBoundary<string, unknown, unknown>[]
>(
  context: ChaosPlanTemplate<PlanNoInfer<TNamespace>, PlanNoInfer<TScenario>, TStages>,
  window: `${number}${'s' | 'm' | 'h'}` = '30m',
  weights: PlanNoInfer<ReadonlyArray<number>> = [1]
): ChaosPlan<TStages> {
  const [amountStr, unit] = window.split(/[smh]/) as [string, 's' | 'm' | 'h'];
  const amount = Number.parseInt(amountStr, 10) || 30;
  const parsedAmount = Number.isNaN(amount) ? 30 : amount;
  const baseDuration = unit === 'h' ? parsedAmount * 3600000 : unit === 'm' ? parsedAmount * 60000 : parsedAmount * 1000;
  const now = Date.now() as EpochMs;
  const timelineBuckets = ['pre-s', 'mid-m', 'post-h'] as const;

  const staged = context.stages.map((stage, index) => {
    const weight = weights[index % Math.max(weights.length, 1)] ?? 1;
    const estimatedDurationMs = Math.max(1, Math.round((baseDuration / Math.max(context.stages.length, 1)) * weight));
    return {
      sliceId: `${stage.name}::stage` as const,
      stageName: stage.name as TStages[number]['name'],
      weight,
      estimatedDurationMs,
      payload: stage.input,
      requires: [],
      output: undefined
    };
  });

  return {
    scenarioId: context.scenarioId,
    namespace: context.namespace,
    stages: context.stages,
    slices: staged as SliceSequence<TStages>,
    timelineBuckets,
    createdAt: now,
    updatedAt: now
  };
}

export function validatePlan<T extends readonly StageBoundary<string, unknown, unknown>[]>(
  stages: T,
  timelineBuckets?: readonly TimelineBucket[]
): {
  readonly ok: boolean;
  readonly issues: readonly PlanValidationIssue[];
} {
  const issues: PlanValidationIssue[] = [];
  const names = new Set<string>();

  for (const stage of stages) {
    if (names.has(stage.name)) {
      issues.push({
        code: 'invalid-order',
        stage: stage.name,
        detail: `stage ${stage.name} duplicated`
      });
    }
    names.add(stage.name);
    if ((stage.weight ?? 0) < 0) {
      issues.push({
        code: 'invalid-weight',
        stage: stage.name,
        detail: 'weight must be non-negative'
      });
    }
  }

  if (timelineBuckets && timelineBuckets.length === 0) {
    issues.push({
      code: 'missing-stage',
      detail: 'plan must include at least one timeline bucket'
    });
  }

  return { ok: issues.length === 0, issues };
}

export interface StepSchedule<T extends readonly StageBoundary<string, unknown, unknown>[]> {
  readonly order: readonly T[number]['name'][];
  readonly weightByStage: Readonly<Record<T[number]['name'], number>>;
  readonly bucketByStage: Readonly<Record<T[number]['name'], TimelineBucket>>;
  readonly runId: RunId;
}

export function materializeSchedule<T extends readonly StageBoundary<string, unknown, unknown>[]>(
  plan: ChaosPlan<T>
): StepSchedule<T> {
  const order = plan.stages.map((stage) => stage.name) as StepSchedule<T>['order'];
  const weightByStage = {} as Record<T[number]['name'], number>;
  const bucketByStage = {} as Record<T[number]['name'], TimelineBucket>;

  for (let index = 0; index < plan.slices.length; index += 1) {
    const slice = plan.slices[index];
    const stageName = slice.stageName as T[number]['name'];
    weightByStage[stageName] = slice.weight ?? index + 1;
    bucketByStage[stageName] =
      plan.timelineBuckets[index % Math.max(plan.timelineBuckets.length, 1)];
  }

  return {
    order,
    weightByStage: weightByStage as StepSchedule<T>['weightByStage'],
    bucketByStage: bucketByStage as StepSchedule<T>['bucketByStage'],
    runId: asRunId(`${plan.namespace}:${plan.scenarioId}:run:${Date.now()}`)
  };
}

type ExtractStageInputs<T extends readonly StageBoundary<string, unknown, unknown>[]> = {
  [K in keyof T]: T[K] extends StageBoundary<string, infer Input, unknown> ? Input : never;
};

export function extractInputs<T extends readonly StageBoundary<string, unknown, unknown>[]>(
  stages: T
): ExtractStageInputs<T> {
  return stages.map((stage) => stage.input) as ExtractStageInputs<T>;
}

export function enrichPlan<T extends readonly StageBoundary<string, unknown, unknown>[]>(
  stages: T,
  baseBucket: TimelineBucket
): SliceSequence<T> {
  const timelineShift = ['pre', 'mid', 'post'] as const;
  return stages.map((stage, index) => ({
    sliceId: `${stage.name}::stage` as const,
    stageName: stage.name,
    weight: stage.weight ?? ((index + 1) / Math.max(stages.length, 1)),
    estimatedDurationMs: Math.max(250, 500 * (index + 1)),
    payload: stage.input,
    output: stage.output,
    requires: index === 0
      ? []
      : [
          `${stages[index - 1]?.name ?? stage.name}::stage` as const
        ]
  })) as SliceSequence<T>;
}
