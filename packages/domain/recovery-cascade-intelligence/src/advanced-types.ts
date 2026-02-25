import type { Brand } from '@shared/core';
import type { Brand as TBrand, NoInfer, TupleOf } from '@shared/type-level';
import type {
  CascadeBlueprint,
  CascadePolicyTemplate,
  StageDependencyTag,
  StageInputByBlueprint,
  StageInputByName,
  StageName,
  StageNameFromManifest,
  StageWeightMap,
} from './types.js';

type BuildTuple<TValue, TLength extends number, TAccumulator extends readonly TValue[] = []> = TAccumulator['length'] extends TLength
  ? TAccumulator
  : BuildTuple<TValue, TLength, readonly [...TAccumulator, TValue]>;

export type StageToken<TPrefix extends string = 'stage'> = `${TPrefix}.${string}`;
export type StageTokenSet<TBlueprint extends CascadeBlueprint> =
  StageNameFromManifest<TBlueprint> | `${TBrand<StageName, 'Tokenized'>}`;

export type StageConstraintId = Brand<string, 'ConstraintId'>;

export type StageConstraintTag = `${TBrand<string, 'ConstraintNamespace'>}:${StageNameFromManifest<any> & string}`;

export type StageVector<TValue, TDepth extends number = 2> = TValue extends TValue[]
  ? TupleOf<TValue, TDepth>
  : never;

export type StageDependencyPath<
  TBlueprint extends CascadeBlueprint,
  TPrefix extends string,
  TDepth extends number = 6,
> = TDepth extends 0
  ? TPrefix
  : readonly [
      StageNameFromManifest<TBlueprint>,
      ...StageVector<StageNameFromManifest<TBlueprint>, TDepth>,
    ];

export interface RegistryEnvelope<TBlueprint extends CascadeBlueprint = CascadeBlueprint> {
  readonly blueprint: TBlueprint;
  readonly template: CascadePolicyTemplate;
  readonly tokens: readonly StageNameFromManifest<TBlueprint>[];
  readonly weights: StageWeightMap;
  readonly manifest: readonly StageNameFromManifest<TBlueprint>[];
}

export interface BlueprintSlice<TBlueprint extends CascadeBlueprint = CascadeBlueprint> {
  readonly name: StageNameFromManifest<TBlueprint>;
  readonly weight: number;
  readonly dependencies: readonly StageNameFromManifest<TBlueprint>[];
}

export type BlueprintSliceMap<TBlueprint extends CascadeBlueprint> = {
  [K in StageNameFromManifest<TBlueprint>]: BlueprintSlice<TBlueprint>;
};

export type StageDependencyMap<TBlueprint extends CascadeBlueprint> = {
  readonly [K in StageNameFromManifest<TBlueprint>]: readonly StageNameFromManifest<TBlueprint>[];
};

type NormalizedBlueprintWeight<TBlueprint extends CascadeBlueprint> = {
  [K in StageNameFromManifest<TBlueprint>]: number;
};

export type StageEnvelopeKey<TBlueprint extends CascadeBlueprint, TSeed extends string = 'stage'> = `${TSeed}.${StageNameFromManifest<TBlueprint>}`;

type NormalizeStageDependency<TInput extends string> = TInput extends `${infer Head}`
  ? Head extends `dep:${infer Name}`
    ? `stage.${Name}`
    : `dep:${TInput}` extends StageDependencyTag
      ? `stage.${TInput}`
      : `stage.${TInput}`
  : never;

const normalizeStageName = (value: string): StageName =>
  value.startsWith('stage.')
    ? (value as StageName)
    : (`stage.${value}` as StageName);

export const buildDependencyMap = <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
): StageDependencyMap<TBlueprint> => {
  const output: Record<StageNameFromManifest<TBlueprint>, readonly StageNameFromManifest<TBlueprint>[]> = {} as Record<
    StageNameFromManifest<TBlueprint>,
    readonly StageNameFromManifest<TBlueprint>[]
  >;

  for (const stage of blueprint.stages) {
    const key = stage.name as StageNameFromManifest<TBlueprint>;
    output[key] = stage.dependencies.map((dependency) => {
      const normalized = dependency.replace(/^dep:/, '');
      return normalizeStageName(normalized) as StageNameFromManifest<TBlueprint>;
    });
  }

  return output;
};

export const buildBlueprintSliceMap = <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
): BlueprintSliceMap<TBlueprint> => {
  const output: Record<StageNameFromManifest<TBlueprint>, BlueprintSlice<TBlueprint>> = {} as Record<
    StageNameFromManifest<TBlueprint>,
    BlueprintSlice<TBlueprint>
  >;

  for (const stage of blueprint.stages) {
    const name = stage.name as StageNameFromManifest<TBlueprint>;
    output[name] = {
      name,
      weight: Number(stage.weight) || 1,
      dependencies: stage.dependencies.map((dependency) => normalizeStageName(dependency.replace(/^dep:/, '')) as never),
    };
  }

  return output;
};

export const buildConstraintTags = <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
): Readonly<Record<StageNameFromManifest<TBlueprint>, StageConstraintId>> => {
  const output = blueprint.stages.reduce<
    Record<StageNameFromBlueprintAlias<TBlueprint>['name'], StageConstraintId>
  >((acc, stage) => {
    acc[stage.name] = `${blueprint.namespace}:constraint:${stage.name}` as StageConstraintId;
    return acc;
  }, {} as Record<StageNameFromBlueprintAlias<TBlueprint>['name'], StageConstraintId>);

  return output as Readonly<Record<StageNameFromManifest<TBlueprint>, StageConstraintId>>;
};

type StageNameFromBlueprintAlias<TBlueprint extends CascadeBlueprint> =
  TBlueprint extends { readonly stages: readonly (infer TStage)[] }
    ? TStage extends { readonly name: infer TName }
      ? {
          readonly name: TName & StageName;
        }
      : never
    : never;

export const resolveDependencyClosure = <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
  roots: readonly StageNameFromManifest<TBlueprint>[],
): readonly StageNameFromManifest<TBlueprint>[] => {
  const map = buildDependencyMap(blueprint);
  const seen = new Set<string>();
  const output: StageNameFromManifest<TBlueprint>[] = [];
  const walk = (target: StageNameFromBlueprintAlias<TBlueprint>['name']) => {
    if (seen.has(target as string)) {
      return;
    }
    seen.add(target as string);
    for (const dependency of map[target as StageNameFromManifest<TBlueprint>] ?? []) {
      walk(dependency as StageNameFromBlueprintAlias<TBlueprint>['name']);
    }
    output.push(target as StageNameFromManifest<TBlueprint>);
  };

  for (const root of roots) {
    walk(root as StageNameFromBlueprintAlias<TBlueprint>['name']);
  }
  return output;
};

export const collectBlueprintSlices = <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
): readonly BlueprintSlice<TBlueprint>[] =>
  blueprint.stages.map((stage) => {
    const name = stage.name as StageNameFromManifest<TBlueprint>;
    return {
      name,
      weight: Number(stage.weight) || 1,
      dependencies: stage.dependencies.map((dependency) => normalizeStageName(dependency.replace(/^dep:/, '')) as StageNameFromManifest<TBlueprint>),
    };
  });

export const toStageVector = <TBlueprint extends CascadeBlueprint, TDepth extends number = 4>(
  blueprint: TBlueprint,
): StageVector<StageNameFromManifest<TBlueprint>, TDepth> => {
  const vector = resolveDependencyClosure(
    blueprint,
    blueprint.stages.map((stage) => stage.name),
  );
  return vector.slice(0, 4) as StageVector<StageNameFromManifest<TBlueprint>, TDepth>;
};

export const inferRegistryKey = <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
  suffix: string,
): StageTokenSet<TBlueprint> => `${blueprint.namespace}:${suffix}` as StageTokenSet<TBlueprint>;

export const buildRegistryEnvelope = <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
): RegistryEnvelope<TBlueprint> => {
  const weights = blueprint.stages.reduce<NormalizedBlueprintWeight<TBlueprint>>((acc, stage) => {
    acc[stage.name as StageNameFromManifest<TBlueprint>] = Number(stage.weight) || 1;
    return acc;
  }, {} as NormalizedBlueprintWeight<TBlueprint>);

  return {
    blueprint,
    template: {
      policyId: blueprint.policyId,
      name: blueprint.namespace,
      namespace: blueprint.namespaceTag,
      blueprint,
      constraints: [],
      thresholds: {
        'threshold.latency': 250,
        'threshold.error': 0.02,
      },
    },
    tokens: blueprint.stages.map((stage) => stage.name as StageNameFromManifest<TBlueprint>),
    weights: weights as StageWeightMap,
    manifest: blueprint.stages.map((stage) => stage.name),
  };
};

export const iterateSlices = <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
): Iterable<BlueprintSlice<TBlueprint>> => {
  const manifest = buildBlueprintSliceMap(blueprint);
  const entries = Object.entries(manifest) as [
    StageNameFromManifest<TBlueprint>,
    BlueprintSlice<TBlueprint>,
  ][];
  return {
    *[Symbol.iterator](): IterableIterator<BlueprintSlice<TBlueprint>> {
      for (const [, slice] of entries) {
        yield slice;
      }
    },
  };
};

export const buildConstraintMap = <TBlueprint extends CascadeBlueprint>(blueprint: TBlueprint) => {
  const manifest = collectBlueprintSlices(blueprint);
  const grouped = manifest.reduce<
    Readonly<Record<StageConstraintTag, StageNameFromManifest<TBlueprint>[]>>
  >(
    (acc, slice) => {
      const tag: StageConstraintTag = `constraint:${slice.name}` as StageConstraintTag;
      acc[tag] = [...(acc[tag] ?? []), slice.name];
      return acc;
    },
    {} as Record<StageConstraintTag, StageNameFromManifest<TBlueprint>[]>,
  );
  return grouped;
};

export const normalizeConstraintTemplate = <
  TBlueprint extends CascadeBlueprint,
>(
  template: {
    readonly id: StageConstraintId;
    readonly kind: string;
    readonly input: unknown;
  },
): {
  readonly id: StageConstraintId;
  readonly kind: `${string}.${string}`;
  readonly input: unknown;
  readonly inputShape: NoInfer<StageInputByBlueprint<TBlueprint>>;
  readonly checksum: string;
} => ({
  id: template.id,
  kind: template.kind as `${string}.${string}`,
  input: template.input,
  inputShape: {} as NoInfer<StageInputByBlueprint<TBlueprint>>,
  checksum: `${template.id}:${template.kind}:${JSON.stringify(template.input)}`,
});

export const buildBlueprintInputMap = <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
): NoInfer<StageInputByBlueprint<TBlueprint>> => {
  const output = {} as StageInputByBlueprint<TBlueprint>;
  for (const stage of blueprint.stages) {
    output[stage.name as StageNameFromManifest<TBlueprint>] = stage.input as StageInputByName<
      TBlueprint,
      StageNameFromManifest<TBlueprint>
    >;
  }
  return output;
};

export const normalizeBlueprintWeights = <TBlueprint extends CascadeBlueprint>(blueprint: TBlueprint): Readonly<Record<string, number>> => {
  const output: Record<string, number> = {};
  for (const stage of blueprint.stages) {
    const parsed = Number(stage.weight);
    output[stage.name] = Number.isFinite(parsed) ? parsed : 1;
  }
  return output;
};
