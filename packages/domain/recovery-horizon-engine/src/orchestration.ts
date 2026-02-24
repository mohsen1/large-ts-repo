import type { PluginStage, StageSpan, HorizonPlan, StageLabel, TimeMs, JsonLike, PluginContract, PluginConfig, Milliseconds } from './types.js';
import { createPluginRegistry, HorizonPluginRegistry } from './registry.js';
import type { PipelineAdapter, PluginSignalLike } from './adapters.js';

type PathMap = {
  [K in `p${number}`]?: string;
};

export type PipelineNodeId = `${string}:${number}`;

export type PathTemplate<T extends string> =
  T extends `${infer Prefix}/${infer Rest}`
    ? `${Prefix}.${PathTemplate<Rest>}`
    : T;

export type TimelineStep<T extends PluginStage> = {
  readonly id: PipelineNodeId;
  readonly stage: T;
  readonly span: StageSpan<T>;
  readonly order: number;
};

export type Timeline<T extends readonly PluginStage[]> = {
  readonly [P in keyof T]: TimelineStep<T[P] & PluginStage>;
};

export type ResolveSteps<
  T extends readonly PluginContract<PluginStage, PluginConfig<PluginStage, JsonLike>, JsonLike>[],
> = {
  readonly timeline: Timeline<{
    readonly [K in keyof T]: PluginStage;
  }>;
  readonly contracts: T;
};

export type StepAccumulator<T extends readonly PluginStage[], TPrefix extends readonly string[] = []> =
  T extends readonly [infer H, ...infer R]
    ? H extends PluginStage
      ? {
          stages: [...TPrefix, H];
          remainder: R extends readonly PluginStage[] ? StepAccumulator<R, [...TPrefix, H]> : StepAccumulator<[], TPrefix>;
        }
      : {
          stages: TPrefix;
          remainder: StepAccumulator<[], TPrefix>;
        }
    : {
        stages: TPrefix;
        remainder: TPrefix;
      };

export const stagePath = <const T extends readonly string[]>(parts: T): PathTemplate<string> => {
  return parts.join('.') as PathTemplate<string>;
};

const defaultSpan = (stage: PluginStage, order: number): StageSpan<PluginStage> => ({
  stage,
  label: `${stage.toUpperCase()}_STAGE` as StageLabel<PluginStage>,
  startedAt: Date.now() as TimeMs,
  durationMs: (order * 150) as Milliseconds<number>,
});

export const sequenceStages = <T extends readonly PluginStage[]>(stages: T): Timeline<T> => {
  return stages.map((stage, order) => ({
    id: `horizon-stage:${stage}:${order}`,
    stage,
    span: defaultSpan(stage, order),
    order,
  })) as Timeline<T>;
};

export type StagePlan<T extends readonly PluginStage[]> = {
  readonly tenantId: string;
  readonly planId: string;
  readonly timeline: Timeline<T>;
};

export type MapToRecord<T extends readonly (readonly [string, unknown])[]> = {
  [K in T[number] as K[0]]: K[1];
};

export const makeStagePlan = <T extends readonly PluginStage[]>(tenantId: string, planId: string, stages: T): StagePlan<T> => ({
  tenantId,
  planId,
  timeline: sequenceStages(stages),
});

export const toRecord = <
  T extends readonly (readonly [string, unknown])[],
>(entries: T): MapToRecord<T> => {
  return entries.reduce((acc, [key, value]) => {
    return {
      ...acc,
      [key]: value,
    } as MapToRecord<T>;
  }, {} as MapToRecord<T>);
};

export const mergePlan = <
  TLeft extends StagePlan<readonly PluginStage[]>,
  TRight extends StagePlan<readonly PluginStage[]>,
>(left: TLeft, right: TRight): {
  readonly tenantId: TLeft['tenantId'];
  readonly planId: `${TLeft['planId']}::${TRight['planId']}`;
  readonly timeline: readonly TimelineStep<PluginStage>[];
} => ({
  tenantId: left.tenantId,
  planId: `${left.planId}::${right.planId}`,
  timeline: [...left.timeline, ...right.timeline] as const,
});

export const flattenTimeline = (plan: StagePlan<readonly PluginStage[]>) =>
  plan.timeline.map(({ id, stage, order }) => ({ id, stage, order }));

export const mapTimelines = <
  TInput extends readonly PluginStage[],
>(plan: StagePlan<TInput>): PathMap => {
  const values = plan.timeline.map((entry) => entry.id);
  return values.reduce<PathMap>((acc, value, index) => {
    acc[`p${index}`] = value;
    return acc;
  }, {});
};

export const makePipelineContext = (tenantId: string, planId: string, now = Date.now()) => ({
  tenantId,
  planId,
  startedAt: now as TimeMs,
});

export const buildRegistry = <T extends readonly PluginStage[]>(stages: T): HorizonPluginRegistry<T> => {
  return createPluginRegistry(stages) as HorizonPluginRegistry<T>;
};

export const flattenContracts = <
  T extends readonly PluginContract<PluginStage, PluginConfig<PluginStage, JsonLike>, JsonLike>[],
>(contracts: T): JsonLike => {
  const timeline = sequenceStages(contracts.map((contract) => contract.kind));
  return {
    timeline,
    metadata: {
      count: contracts.length,
    },
  } as unknown as JsonLike;
};

export const normalizePlanPayload = (input: Partial<HorizonPlan>) => {
  const now = Date.now();
  return {
    id: input.id ?? (`gen-${now}` as any),
    tenantId: input.tenantId ?? 'default',
    startedAt: now as TimeMs,
    pluginSpan: defaultSpan('analyze', 0),
    payload: input.payload,
  } satisfies HorizonPlan;
};

export const executePipeline = async <T extends PipelineAdapter<PluginStage, any, PluginSignalLike>>(
  adapter: T,
  input: ReadonlyArray<PluginConfig<PluginStage, JsonLike>>,
  stages: PluginStage[],
): Promise<readonly PluginSignalLike[]> => {
  const supported = stages.filter((stage) => adapter.supportedStages.includes(stage));
  const normalized = supported.flatMap((stage) => {
    const base = input[0];
    if (!base) {
      return [] as PluginConfig<PluginStage, JsonLike>[];
    }
    return [{ ...base, pluginKind: stage, payload: base.payload } satisfies PluginConfig<PluginStage, JsonLike>];
  });
  const output = await adapter.execute(normalized as ReadonlyArray<PluginConfig<PluginStage, JsonLike>>, new AbortController().signal);
  return output as readonly PluginSignalLike[];
};

export const pickTimelineWindow = <T extends StagePlan<readonly PluginStage[]>>(plan: T, start: number, end: number) => {
  return plan.timeline.filter((entry) => entry.order >= start && entry.order <= end);
};
