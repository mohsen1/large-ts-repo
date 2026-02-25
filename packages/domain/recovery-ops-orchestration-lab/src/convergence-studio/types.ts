import { Brand, Prettify, NoInfer, RecursivePath, DeepReadonly } from '@shared/type-level';

export type ConvergenceDomain = 'fabric' | 'signal' | 'policy' | 'runtime' | 'control';
export type ConvergenceFacet = 'planner' | 'executor' | 'observer' | 'advisor';
export type ConvergenceSeverity = 'critical' | 'warn' | 'stable' | 'saturated';
export type ConvergenceMode = 'simulate' | 'observe' | 'verify' | 'recover';
export type ConvergenceLifecycle = 'draft' | 'queued' | 'running' | 'complete' | 'degraded';

export type ConvergenceStudioId = Brand<string, 'ConvergenceStudioId'>;
export type ConvergenceRunId = Brand<string, 'ConvergenceRunId'>;
export type ConvergencePlanId = Brand<string, 'ConvergencePlanId'>;
export type ConvergencePluginId = Brand<string, 'ConvergencePluginId'>;
export type ConvergenceTag = Brand<string, 'ConvergenceTag'>;
export type ConvergenceTemplateName<TPrefix extends string = string> = `${TPrefix}-studio-template`;
export type ConvergenceStepId<TStage extends string = string> = Brand<`step:${TStage}:${string}`, 'ConvergenceStepId'>;
export type ConvergenceStage = 'discover' | 'evaluate' | 'simulate' | 'execute' | 'close';
export type ConvergenceStageConfig = Record<ConvergenceStage, number>;
export type TemplateVersion = `${number}.${number}.${number}`;

export type StageSelector = ConvergenceLifecycle | (string & { readonly __stageTag: never });
export type StageTuple<T extends readonly unknown[]> = T extends readonly [infer H, ...infer R]
  ? [H, ...StageTuple<R & readonly unknown[]>]
  : readonly [];

export type StageTransition<TCurrent extends ConvergenceStage, TNext extends ConvergenceStage> = TCurrent extends 'discover'
  ? TNext extends 'evaluate' | 'close'
    ? true
    : false
  : TCurrent extends 'evaluate'
    ? TNext extends 'simulate' | 'close'
      ? true
      : false
    : TCurrent extends 'simulate'
      ? TNext extends 'execute' | 'close'
        ? true
        : false
      : TCurrent extends 'execute'
        ? TNext extends 'close' | 'degraded'
          ? true
          : false
        : false;

type StageDependencyMap = {
  draft: ConvergenceLifecycle;
  queued: 'running';
  running: 'complete' | 'degraded';
  complete: 'degraded';
  degraded: 'running';
};
export type StageDependency<T extends StageSelector> = T extends keyof StageDependencyMap ? StageDependencyMap[T] : never;

export interface ConvergenceSignal {
  readonly id: Brand<string, 'ConvergenceSignalId'>;
  readonly phase: ConvergenceStage;
  readonly domain: ConvergenceDomain;
  readonly severity: ConvergenceSeverity;
  readonly score: number;
  readonly tags: readonly ConvergenceTag[];
  readonly timestamp: string;
}

export interface ConvergenceConstraint {
  readonly code: Brand<string, 'ConvergenceConstraintCode'>;
  readonly scope: ConvergenceDomain;
  readonly required: boolean;
  readonly weight: number;
}

export interface ConvergenceContext {
  readonly workspaceId: ConvergenceStudioId;
  readonly tenant: string;
  readonly runId: ConvergenceRunId;
  readonly mode: ConvergenceMode;
  readonly startedAt: string;
}

export interface ConvergencePluginDescriptor<
  TInput = unknown,
  TOutput = unknown,
  TStage extends ConvergenceStage = ConvergenceStage,
> {
  readonly id: ConvergencePluginId;
  readonly name: string;
  readonly stage: TStage;
  readonly facets: readonly ConvergenceFacet[];
  readonly template: Brand<string, 'PluginTemplate'>;
  readonly priority: number;
  readonly dependsOn: readonly ConvergencePluginId[];
  readonly config: Readonly<Record<string, unknown>>;
  readonly run: (input: TInput, context: ConvergenceContext) => Promise<TOutput>;
}

export interface ConvergenceBlueprint {
  readonly id: ConvergenceTemplateName;
  readonly version: TemplateVersion;
  readonly domain: ConvergenceDomain;
  readonly labels: readonly ConvergenceTag[];
  readonly stages: readonly ConvergenceStage[];
  readonly constraints: readonly ConvergenceConstraint[];
}

export interface StudioPlan<T extends readonly ConvergencePluginDescriptor[] = readonly ConvergencePluginDescriptor[]> {
  readonly id: ConvergencePlanId;
  readonly stage: ConvergenceLifecycle;
  readonly workspaceId: ConvergenceStudioId;
  readonly blueprint: ConvergenceBlueprint;
  readonly plugins: T;
  readonly context: ConvergenceContext;
  readonly metrics: ConvergenceStageConfig;
  readonly startedAt: string;
  readonly completedAt?: string;
}

export type PlanWithPlugins<T extends StudioPlan> = T & {
  plugins: StageFilteredPlugins<T['plugins']>;
};

export type StageBuckets<TPlugins extends readonly ConvergencePluginDescriptor[]> = {
  readonly discover_plugins: readonly Extract<TPlugins[number], { readonly stage: 'discover' }>[];
  readonly evaluate_plugins: readonly Extract<TPlugins[number], { readonly stage: 'evaluate' }>[];
  readonly simulate_plugins: readonly Extract<TPlugins[number], { readonly stage: 'simulate' }>[];
  readonly execute_plugins: readonly Extract<TPlugins[number], { readonly stage: 'execute' }>[];
  readonly close_plugins: readonly Extract<TPlugins[number], { readonly stage: 'close' }>[];
};

export type StageFilteredPlugins<TPlugins extends readonly ConvergencePluginDescriptor[]> = StageBuckets<TPlugins>[keyof StageBuckets<TPlugins>];

export type StageMap<TPlugins extends readonly ConvergencePluginDescriptor[]> = {
  discover: readonly Extract<TPlugins[number], { readonly stage: 'discover' }>[];
  evaluate: readonly Extract<TPlugins[number], { readonly stage: 'evaluate' }>[];
  simulate: readonly Extract<TPlugins[number], { readonly stage: 'simulate' }>[];
  execute: readonly Extract<TPlugins[number], { readonly stage: 'execute' }>[];
  close: readonly Extract<TPlugins[number], { readonly stage: 'close' }>[];
};

export type PluginTuple<TPlugin extends ConvergencePluginDescriptor = ConvergencePluginDescriptor> = readonly [
  TPlugin['id'],
  TPlugin['stage'],
  TPlugin['name'],
];

export type PluginTupleStream<TPlugins extends readonly ConvergencePluginDescriptor[]> = TPlugins extends readonly [
  infer Head,
  ...infer Rest,
]
  ? Head extends ConvergencePluginDescriptor
    ? Rest extends readonly ConvergencePluginDescriptor[]
      ? readonly [PluginTuple<Head>, ...PluginTupleStream<Rest>]
      : readonly []
    : readonly []
  : readonly [];

export type PluginMap<TPlugins extends readonly ConvergencePluginDescriptor[]> = {
  [K in TPlugins[number] as K['id']]: K;
};

export type PluginLookup<TPlugins extends readonly ConvergencePluginDescriptor[], TId extends ConvergencePluginId> =
  Extract<TPlugins[number], { readonly id: TId }>;

export interface ConvergencePlanSelection<TPlugins extends readonly ConvergencePluginDescriptor[]> {
  readonly runId: ConvergenceRunId;
  readonly planId: ConvergencePlanId;
  readonly stage: ConvergenceStage;
  readonly selected: readonly PluginMap<TPlugins>[keyof PluginMap<TPlugins>][];
}

export type RemapConstraintKeys<TRecord extends Record<string, ConvergenceConstraint>> = {
  [K in keyof TRecord as `constraint_${Extract<K, string>}`]: TRecord[K]['weight'];
};

export type InferPlanInput<T extends StudioPlan> = T extends StudioPlan<infer TPlugins>
  ? StageFilteredPlugins<TPlugins>
  : never;

export type NormalizeScore<T extends number> = T extends number ? (T | 0) & number : never;
export type NoInferPlugin<T extends ConvergencePluginDescriptor> = [T][T extends any ? 0 : never];

export type PluginName<K extends string> = `${K}-plugin`;
export type RecursivePathMap<T extends object> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends object
        ? `${K}.${RecursivePath<T[K]>}` | K
        : K;
    }[keyof T & string]
  : never;

export interface ConvergenceSummary {
  readonly runId: ConvergenceRunId;
  readonly workspaceId: ConvergenceStudioId;
  readonly stageTrail: readonly ConvergenceStage[];
  readonly selectedPlugins: readonly ConvergencePluginId[];
  readonly score: NormalizeScore<number>;
  readonly tags: readonly ConvergenceTag[];
  readonly diagnostics: readonly string[];
}

export const normalizePlanId = (value: string): ConvergencePlanId => value as ConvergencePlanId;
export const normalizeStudioId = (value: string): ConvergenceStudioId => value as ConvergenceStudioId;
export const normalizeRunId = (value: string): ConvergenceRunId => value as ConvergenceRunId;
export const normalizePluginId = (value: string): ConvergencePluginId => value as ConvergencePluginId;
export const normalizeTemplateName = (value: string): ConvergenceTemplateName => value as ConvergenceTemplateName;
export const normalizeConvergenceTag = (value: string): ConvergenceTag => value as ConvergenceTag;

export const withConstraintDefaults = (
  constraint: ConvergenceConstraint,
): Prettify<ConvergenceConstraint> => ({
  ...constraint,
  weight: Math.max(0.01, Math.min(1, constraint.weight)),
});

export const clampSignalScore = (score: number): number => Number(Math.max(0, Math.min(1, score)).toFixed(3));

export const buildConvergenceMap = <
  const TPlugins extends readonly ConvergencePluginDescriptor[],
>(plugins: NoInfer<TPlugins>): PluginMap<TPlugins> => {
  const map = {} as PluginMap<TPlugins>;
  for (const plugin of plugins) {
    map[plugin.id as keyof PluginMap<TPlugins>] = plugin as PluginMap<TPlugins>[keyof PluginMap<TPlugins>];
  }
  return map;
};

export const normalizeBlueprintStages = (input: readonly ConvergenceStage[]): readonly ConvergenceStage[] => [...input].toSorted();

export const normalizeBlueprintLabelSet = (labels: readonly string[]): readonly ConvergenceTag[] =>
  [...new Set(labels.map((label) => normalizeConvergenceTag(label.toLowerCase().trim())))];

export const normalizeSummary = (
  payload: Omit<ConvergenceSummary, 'score'> & { readonly score: number },
): ConvergenceSummary => ({
  ...payload,
  score: payload.score,
  diagnostics: payload.diagnostics.toSorted(),
});

export const normalizePlugins = <TPlugins extends readonly ConvergencePluginDescriptor[]>(
  plugins: TPlugins,
): ReadonlyArray<TPlugins[number]> => [...plugins];

export const mergePluginTuples = <TLeft extends StageTuple<readonly ConvergencePluginDescriptor[]>, TRight extends StageTuple<readonly ConvergencePluginDescriptor[]>>(
  left: TLeft,
  right: TRight,
): readonly [...TLeft, ...TRight] => [...left, ...right] as const;

export const projectPaths = <TRecord extends Record<string, unknown>>(
  record: TRecord,
): readonly RecursivePathMap<TRecord>[] => Object.keys(record).map((key) => key as RecursivePathMap<TRecord>);

export const cloneDeepImmutable = <TRecord extends Record<string, unknown>>(value: TRecord): DeepReadonly<TRecord> =>
  structuredClone(value) as DeepReadonly<TRecord>;
