import type { Brand } from '@shared/core';
import type { NoInfer, TupleOf } from '@shared/type-level';
import { analyzeTopology, buildRuntimeManifest, buildTopologyGraph, createPathVector, runTopology, normalizeTopologyWeights } from '@shared/cascade-intelligence-runtime';
import type { CascadeBlueprint, CascadePolicyTemplate, StageInputByName, StageInputByBlueprint, StageNameFromManifest } from './types.js';
import { toStageVector } from './advanced-types.js';

export type ExperimentId = Brand<string, 'ExperimentId'>;
export type ExperimentLabel = Brand<string, 'ExperimentLabel'>;
export type ExperimentSignal = `experiment.${string}`;

type StageWeightBucket = {
  readonly name: string;
  readonly weight: number;
};

export type ExperimentPathNode<TBlueprint extends CascadeBlueprint> = {
  readonly stage: StageNameFromBlueprint<TBlueprint>;
  readonly input: StageInputByName<TBlueprint, StageNameFromBlueprint<TBlueprint>>;
  readonly dependencies: readonly StageNameFromBlueprint<TBlueprint>[];
  readonly estimatedWeight: number;
};

export interface ExperimentVariant<TBlueprint extends CascadeBlueprint = CascadeBlueprint> {
  readonly id: ExperimentId;
  readonly name: ExperimentLabel;
  readonly path: readonly ExperimentPathNode<TBlueprint>[];
  readonly weight: number;
  readonly signal: ExperimentSignal;
  readonly enabled: boolean;
  readonly priority: number;
}

export interface ExperimentInput<TBlueprint extends CascadeBlueprint = CascadeBlueprint> {
  readonly blueprint: TBlueprint;
  readonly template: CascadePolicyTemplate;
  readonly labels: readonly ExperimentLabel[];
}

export interface ExperimentResult<TBlueprint extends CascadeBlueprint = CascadeBlueprint> {
  readonly id: ExperimentId;
  readonly input: ExperimentInput<TBlueprint>;
  readonly labels: readonly ExperimentLabel[];
  readonly stages: readonly StageNameFromManifest<TBlueprint>[];
  readonly signature: string;
  readonly score: number;
  readonly topology: string;
}

type StageNameFromBlueprint<TBlueprint extends CascadeBlueprint> =
  TBlueprint extends { readonly stages: readonly (infer TStage)[] }
    ? TStage extends { readonly name: infer TName }
      ? TName & StageNameFromManifest<TBlueprint>
      : never
    : never;

type NonEmptyVariantTuple<
  TBlueprint extends CascadeBlueprint,
  TList extends readonly ExperimentVariant<TBlueprint>[],
> = TList extends readonly []
  ? readonly [ExperimentVariant<TBlueprint>]
  : readonly [TList[0], ...TList];

export interface ExperimentMatrix<
  TBlueprint extends CascadeBlueprint,
  TList extends readonly ExperimentVariant<TBlueprint>[],
> {
  readonly variants: NonEmptyVariantTuple<TBlueprint, TList>;
  readonly baseline: TList[number];
  readonly metadata: {
    readonly blueprint: TBlueprint['namespace'];
    readonly variantCount: TList['length'];
    readonly vectorCount: TupleOf<number, TList['length']>;
  };
}

const formatSignal = (value: string): ExperimentSignal =>
  `experiment.${value.toLowerCase().replace(/[^a-z0-9-]+/g, '-')}` as ExperimentSignal;

const resolveStageMap = <TBlueprint extends CascadeBlueprint>(blueprint: TBlueprint): StageInputByBlueprint<TBlueprint> => {
  const output = {} as StageInputByBlueprint<TBlueprint>;
  for (const stage of blueprint.stages) {
    output[stage.name as StageNameFromManifest<TBlueprint>] = stage.input;
  }
  return output;
};

const resolveStageWeights = <TBlueprint extends CascadeBlueprint>(blueprint: TBlueprint): StageWeightBucket[] => blueprint.stages
  .map((stage) => ({
    name: stage.name,
    weight: Number.isFinite(Number(stage.weight)) ? Number(stage.weight) : 1,
  }));

const buildPath = <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
  horizon: readonly StageNameFromManifest<TBlueprint>[],
): readonly ExperimentPathNode<TBlueprint>[] => {
  const inputByStage = resolveStageMap(blueprint);
  const weights = new Map<string, number>(resolveStageWeights(blueprint).map((entry) => [entry.name, entry.weight]));
  const depsByStage = new Map<string, readonly string[]>(
    blueprint.stages.map((stage) => [stage.name, stage.dependencies.map((entry) => `stage.${entry.replace(/^dep:/, '')}`)]),
  );

  return horizon.map((stage) => ({
    stage: stage as StageNameFromBlueprint<TBlueprint>,
    input: inputByStage[stage] as StageInputByName<TBlueprint, StageNameFromBlueprint<TBlueprint>>,
    dependencies: depsByStage.get(stage) as readonly StageNameFromBlueprint<TBlueprint>[] ?? [],
    estimatedWeight: weights.get(stage) ?? 1,
  }));
};

const scoreVariant = <TBlueprint extends CascadeBlueprint>(path: readonly ExperimentPathNode<TBlueprint>[]): number =>
  path.reduce((acc, entry, index) => acc + (entry.estimatedWeight * (index + 1)) + entry.dependencies.length, 0);

export const buildExperimentVariants = <TBlueprint extends CascadeBlueprint>(
  input: ExperimentInput<TBlueprint>,
): readonly ExperimentVariant<TBlueprint>[] => {
  const graph = buildTopologyGraph(input.blueprint.stages.map((entry) => entry.name as string));
  const ordered = runTopology(graph);
  const orderedNames = ordered as StageNameFromManifest<TBlueprint>[];
  const baseline = orderedNames.slice(0, 1);
  const fallback = toStageVector(input.blueprint) as StageNameFromManifest<TBlueprint>[];
  const topology = orderedNames.length > 0 ? orderedNames : fallback;

  return topology.map((stage, index) => {
    const path = buildPath(input.blueprint, topology.slice(0, index + 1));
    const signal = formatSignal(`${input.blueprint.namespace}:${stage}`);
    return {
      id: `experiment:${input.blueprint.policyId}:${signal}` as ExperimentId,
      name: `${signal}:${index}` as ExperimentLabel,
      path,
      weight: Math.max(1, scoreVariant(path)),
      signal,
      enabled: index % 2 === 0,
      priority: topology.length - index,
    };
  }, []).filter((entry) => entry.path.length > 0 || baseline.includes(entry.path.at(-1)?.stage ?? ''));
};

const scoreMatrix = <TBlueprint extends CascadeBlueprint>(
  result: ExperimentResult<TBlueprint>,
): number => {
  const metrics = result.topology.split('|').length;
  return Number((result.score / Math.max(1, metrics)).toFixed(4));
};

export const buildExperimentResult = <TBlueprint extends CascadeBlueprint>(
  input: ExperimentInput<TBlueprint>,
  variant: ExperimentVariant<TBlueprint>,
): ExperimentResult<TBlueprint> => {
  const graph = buildTopologyGraph(input.blueprint.stages.map((stage) => stage.name as string));
  const inspected = analyzeTopology(graph);
  const weighted = normalizeTopologyWeights(graph);
  const signature = createPathVector(
    [input.blueprint.namespace, input.template.policyId, String(input.labels.length)] as const,
    `result:${inspected.maxDepth}`,
  );
  const stages = runTopology(graph) as StageNameFromManifest<TBlueprint>[];
  return {
    id: variant.id,
    input,
    labels: input.labels,
    stages,
    signature,
    score: scoreMatrix({
      id: variant.id,
      input,
      labels: input.labels,
      stages,
      signature,
      topology: `${inspected.maxDepth}::${Object.keys(weighted).length}`,
    }),
    topology: `${inspected.nodes.length}::${inspected.edges}::${input.blueprint.policyId}`,
  };
};

export const buildExperimentMatrix = <TBlueprint extends CascadeBlueprint>(
  input: ExperimentInput<TBlueprint>,
): ExperimentMatrix<TBlueprint, readonly ExperimentVariant<TBlueprint>[]> => {
  const variants = buildExperimentVariants(input);
  if (variants.length === 0) {
    throw new Error(`experiment.empty:${input.blueprint.policyId}`);
  }

  const baseline = variants[0]!;
  const vector = variants.map((variant) => variant.weight) as TupleOf<number, typeof variants['length']>;
  return {
    variants: [baseline, ...variants.slice(1)] as NonEmptyVariantTuple<TBlueprint, ExperimentVariant<TBlueprint>[]>,
    baseline,
    metadata: {
      blueprint: input.blueprint.namespace,
      variantCount: variants.length,
      vectorCount: vector,
    },
  };
};

export const prioritizeVariants = <TBlueprint extends CascadeBlueprint>(
  variants: readonly ExperimentVariant<TBlueprint>[],
): readonly ExperimentVariant<TBlueprint>[] => [...variants].toSorted((left, right) => right.priority - left.priority);

export const normalizeExperimentBlueprint = <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
  labels: readonly ExperimentLabel[],
): ExperimentInput<TBlueprint> => {
  const stageMap = new Map(blueprint.stages.map((stage, index) => [stage.name, index]));
  const sorted = [...stageMap.keys()].toSorted();
  const template = buildRuntimeManifest({
    name: blueprint.namespace,
    scope: blueprint.namespace.replace('cascade-intel:', ''),
    source: `source:${blueprint.namespace}`,
    aliases: sorted,
    tags: labels.map((label) => label),
    mode: 'adaptive',
  });

  return {
    blueprint,
    template,
    labels,
  };
};

export const buildExperimentFold = <TBlueprint extends CascadeBlueprint>(
  input: NoInfer<ExperimentInput<TBlueprint>>,
): readonly StageNameFromManifest<TBlueprint>[] =>
  runTopology(
    buildTopologyGraph(input.blueprint.stages.map((stage) => stage.name)),
  ) as StageNameFromManifest<TBlueprint>[];

export const mapExperimentVariantsToSignals = <TBlueprint extends CascadeBlueprint>(
  variants: readonly ExperimentVariant<TBlueprint>[],
): Readonly<Record<ExperimentSignal, ExperimentLabel>> => {
  return variants.reduce<Record<ExperimentSignal, ExperimentLabel>>((acc, variant) => {
    acc[variant.signal] = variant.name;
    return acc;
  }, {} as Record<ExperimentSignal, ExperimentLabel>);
};
