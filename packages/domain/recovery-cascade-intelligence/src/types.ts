import type { Brand, Edge, Graph, RecursivePath, TupleOf } from '@shared/core';
import type { NoInfer } from '@shared/type-level';

export type IntelligenceNamespace<TNamespace extends string = string> = `cascade-intel:${TNamespace}`;
export type PolicyNamespace<TNamespace extends string = string> = `policy:${TNamespace}`;
export type StageName = `stage.${string}`;
export type StageDependency = `dep:${string}`;
export type StageDependencyTag = StageDependency;
export type PluginId = Brand<string, 'PluginId'>;
export type PolicyId = Brand<string, 'PolicyId'>;
export type StrategyId = Brand<string, 'StrategyId'>;
export type RunId = Brand<string, 'RunId'>;
export type BrandedRevision = Brand<string, 'PolicyCatalogRevision'>;
export type PolicyCatalogName = `catalog:${string}`;
export type PolicyTag = `tag:${string}`;
export type RegistryTag = `registry:${string}`;
export type RiskBand = 'critical' | 'high' | 'medium' | 'low';
export type CatalogSignature = `${string}#${string}`;
export type CatalogSort = 'age' | 'name' | 'weight' | 'risk';
export type CatalogPolicyName = `${string}.${string}`;
export type RiskDimension = `risk.${string}`;
export type RegistryEventKind = 'register' | 'activate' | 'deactivate' | 'remove';
export type PolicyBlueprintId = Brand<string, 'PolicyBlueprintId'>;
export type StageId = Brand<string, 'StageId'>;
export type RiskEnvelope = Brand<
  {
    readonly factor: RiskDimension;
    readonly score: number;
    readonly severity: RiskBand;
  },
  'RiskEnvelope'
>;
export type TenantIdentity = {
  readonly id: Brand<string, 'TenantId'>;
  readonly segment: Brand<string, 'TenantSegment'>;
  readonly environment: Brand<string, 'TenantEnvironment'>;
};

export interface StageContract<
  TName extends StageName = StageName,
  TInput = unknown,
  TOutput = unknown,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly name: TName;
  readonly stageId: StageId;
  readonly dependencies: readonly StageDependency[];
  readonly input: TInput;
  readonly output: TOutput;
  readonly metadata: TMeta;
  readonly weight: number;
}

export interface CascadeBlueprint<
  TNamespace extends string = string,
  TStages extends readonly StageContract[] = readonly StageContract[],
  TFocus extends readonly StageName[] = readonly StageName[],
> {
  readonly namespace: IntelligenceNamespace<TNamespace>;
  readonly namespaceTag: PolicyNamespace<TNamespace>;
  readonly policyId: PolicyId;
  readonly strategyId: StrategyId;
  readonly tenant: TenantIdentity;
  readonly riskBand: RiskBand;
  readonly stages: TStages;
  readonly notes: string;
  readonly publishedAt: string;
  readonly schemaVersion: `v${number}.${number}.${number}`;
  readonly focusStages: TFocus;
}

export interface CascadePolicyConstraint<TDimensions extends Record<string, unknown> = Record<string, unknown>> {
  readonly id: Brand<string, 'PolicyConstraint'>;
  readonly tags: readonly PolicyTag[];
  readonly dimensions: TDimensions;
  readonly weight: Brand<number, 'StrategyWeight'>;
}

export interface CascadePolicyTemplate<
  TId extends string = string,
  TBlueprint extends CascadeBlueprint = CascadeBlueprint,
  TConstraint extends CascadePolicyConstraint = CascadePolicyConstraint,
> {
  readonly policyId: PolicyId;
  readonly name: TId;
  readonly namespace: PolicyNamespace<TId>;
  readonly blueprint: TBlueprint;
  readonly constraints: readonly TConstraint[];
  readonly thresholds: Readonly<Record<`threshold.${string}`, number>>;
}

export interface PolicyRuntimeConfig {
  readonly enableDebug: boolean;
  readonly maxParallelism: number;
  readonly timeoutMs: number;
  readonly labels: readonly string[];
}

export interface MetricObservation<TName extends string = string> {
  readonly name: TName;
  readonly value: number;
  readonly unit: `unit:${string}`;
  readonly dimensions?: Readonly<Record<string, string>>;
  readonly measuredAt: string;
}

export interface CascadePolicyRun<
  TBlueprint extends CascadeBlueprint = CascadeBlueprint,
  TMetric extends MetricObservation = MetricObservation,
> {
  readonly runId: RunId;
  readonly blueprint: TBlueprint;
  readonly tenantId: TenantIdentity['id'];
  readonly status: 'idle' | 'running' | 'ok' | 'warn' | 'degraded';
  readonly metrics: readonly TMetric[];
  readonly risk: {
    readonly factor: RiskDimension;
    readonly score: number;
    readonly severity: RiskBand;
  };
  readonly startedAt: string;
  readonly finishedAt?: string;
}

export interface PolicyDraftMeta {
  readonly source: string;
  readonly generatedAt: string;
  readonly revision: BrandedRevision;
}

export interface PolicyDraft<TBlueprint extends CascadeBlueprint = CascadeBlueprint> {
  readonly blueprint: TBlueprint;
  readonly notes: string;
  readonly focus: readonly StageName[];
  readonly metadata?: PolicyDraftMeta;
}

export interface Insight {
  readonly key: `insight:${string}`;
  readonly score: number;
  readonly text: string;
}

export interface StageWeightMap {
  readonly [stage: StageName]: number;
}

export interface StageEdge<TName extends StageName = StageName> {
  readonly from: TName;
  readonly to: TName;
  readonly weight: number;
  readonly channel: `c:${string}`;
  readonly index?: number;
}

export interface StageGraph<TBlueprint extends CascadeBlueprint> {
  readonly namespace: TBlueprint['namespace'];
  readonly edges: readonly StageEdge<
    StageNameFromManifest<TBlueprint>
  >[];
  readonly ordered: readonly StageNameFromManifest<TBlueprint>[];
}

export type StageNameFromManifest<TBlueprint extends CascadeBlueprint> = TBlueprint['stages'][number]['name'];

export type StageInputByName<
  TBlueprint extends CascadeBlueprint,
  TName extends StageNameFromManifest<TBlueprint>,
> = Extract<TBlueprint['stages'][number], { readonly name: TName }>['input'];

export type StageOutputByName<
  TBlueprint extends CascadeBlueprint,
  TName extends StageNameFromManifest<TBlueprint>,
> = Extract<TBlueprint['stages'][number], { readonly name: TName }>['output'];

export type StageInputByBlueprint<TBlueprint extends CascadeBlueprint> = {
  [TName in StageNameFromManifest<TBlueprint>]: StageInputByName<TBlueprint, TName>;
};

export type StageOutputByBlueprint<TBlueprint extends CascadeBlueprint> = {
  [TName in StageNameFromManifest<TBlueprint>]: StageOutputByName<TBlueprint, TName>;
};

export type StageDependencyMap<TBlueprint extends CascadeBlueprint> = {
  [TName in StageNameFromManifest<TBlueprint>]: readonly StageDependency[];
};

export interface RegistryDigest<TBlueprint extends CascadeBlueprint = CascadeBlueprint> {
  readonly namespace: TBlueprint['namespace'];
  readonly signature: CatalogSignature;
  readonly policyCount: number;
}

export type StageListTuple<TBlueprint extends CascadeBlueprint> = readonly [...TBlueprint['stages']];

export type BlueprintTemplateResult<TBlueprint extends CascadeBlueprint> = {
  readonly blueprint: TBlueprint;
  readonly edges: readonly StageEdge<StageNameFromManifest<TBlueprint>>[];
};

export type StageInputVector<TBlueprint extends CascadeBlueprint> = {
  [K in StageNameFromManifest<TBlueprint>]: StageInputByName<TBlueprint, K>;
};

export type StageOutputVector<TBlueprint extends CascadeBlueprint> = {
  [K in StageNameFromManifest<TBlueprint>]: StageOutputByName<TBlueprint, K>;
};

export type StageDependencyLayer<TBlueprint extends CascadeBlueprint> = readonly StageNameFromManifest<TBlueprint>[];

export type StageDependencyLayers<TBlueprint extends CascadeBlueprint> = readonly StageNameFromManifest<TBlueprint>[][];

type BuildTuple<TValue, TLength extends number, TAccumulator extends readonly TValue[] = []> =
  TAccumulator['length'] extends TLength
    ? TAccumulator
    : BuildTuple<TValue, TLength, readonly [...TAccumulator, TValue]>;

export type Decrement<TDepth extends number> = TDepth extends 0
  ? 0
  : BuildTuple<unknown, TDepth> extends readonly [unknown, ...infer Tail]
    ? Tail['length']
    : number;

export type RecursiveTuple<TValue, TDepth extends number> = TDepth extends 0
  ? readonly []
  : readonly [TValue, ...RecursiveTuple<TValue, Decrement<TDepth>>];

export type TemplateThresholdRecord = Record<`threshold.${string}`, number>;
export type StageEdgeList<TBlueprint extends CascadeBlueprint> = readonly StageEdge<StageNameFromManifest<TBlueprint>>[];
export type TopologyFromBlueprint<TBlueprint extends CascadeBlueprint> = {
  readonly nodes: StageListTuple<TBlueprint>;
  readonly edges: StageEdgeList<TBlueprint>;
};

export type TailFromTuple<T extends readonly unknown[]> = T extends readonly [any, ...infer Rest]
  ? Rest
  : readonly [];

export type Join<TTuple extends readonly string[]> = TTuple extends readonly [
  infer H extends string,
  ...infer R extends readonly string[],
]
  ? `${H}.${Join<R>}`
  : '';

export type KeyByDepth<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Rest]
  ? { head: Head; readonly depth: Rest['length'] }
  : never;

export type DeepPick<T, K extends PropertyKey> = T extends readonly [infer Head, ...infer Rest]
  ? K extends keyof Head
    ? Head[K]
    : DeepPick<Rest[number], K>
  : never;

export type InferGraph<TBlueprint extends CascadeBlueprint> = Graph<
  Brand<string, 'NodeId'>,
  StageEdge<StageNameFromManifest<TBlueprint>>
>;

export const tenantIdentityPattern = /^tenant-[a-z0-9-]+:[a-z0-9-]+$/;
export const namespacePattern = /^cascade-intel:[a-z0-9][a-z0-9-]*$/;
export const policyIdPattern = /^pol:[a-z0-9-]+$/;

const normalizeTenantSegment = (segment: string): string =>
  segment.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');

export const normalizePolicyId = (value: string): PolicyId => {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return `pol:${normalized}` as PolicyId;
};

export const normalizeStrategyId = (value: string): StrategyId => {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return `str:${normalized}` as StrategyId;
};

export const normalizeTenant = (value: {
  readonly tenant: string;
  readonly segment: string;
  readonly environment: string;
}): TenantIdentity => ({
  id: tenantIdentityPattern.test(value.tenant)
    ? (value.tenant as TenantIdentity['id'])
    : (`tenant:${normalizeTenantSegment(value.tenant)}` as TenantIdentity['id']),
  segment: `segment:${normalizeTenantSegment(value.segment)}` as TenantIdentity['segment'],
  environment: `environment:${normalizeTenantSegment(value.environment)}` as TenantIdentity['environment'],
});

export const normalizePolicyTemplate = <
  TBlueprint extends CascadeBlueprint,
  TConstraint extends CascadePolicyConstraint = CascadePolicyConstraint,
>(
  input: Readonly<{
    readonly policyId: string;
    readonly name: string;
    readonly namespace: string;
    readonly blueprint: NoInfer<TBlueprint>;
    readonly constraints?: readonly TConstraint[];
    readonly thresholds?: TemplateThresholdRecord;
  }>,
): CascadePolicyTemplate<TBlueprint['namespace'], TBlueprint, TConstraint> => ({
  policyId: normalizePolicyId(input.policyId),
  name: input.name as string & TBlueprint['namespace'],
  namespace: `policy:${input.namespace}` as CascadePolicyTemplate<TBlueprint['namespace'], TBlueprint, TConstraint>['namespace'],
  blueprint: input.blueprint,
  constraints: [...(input.constraints ?? [])],
  thresholds: {
    'threshold.latency': 250,
    'threshold.error': 0.02,
    ...input.thresholds,
  } satisfies Record<`threshold.${string}`, number>,
});

export const normalizeCatalog = <TBlueprint extends CascadeBlueprint>(blueprint: TBlueprint): TBlueprint => ({
  ...blueprint,
  publishedAt: new Date().toISOString(),
  focusStages: [...blueprint.focusStages],
}) as TBlueprint;

export const normalizeCatalogScope = (catalog: string): PolicyCatalogName => `catalog:${catalog}` as PolicyCatalogName;
export const toCatalogNamespace = (catalog: string): PolicyCatalogName => normalizeCatalogScope(catalog);
export const normalizeCatalogKey = (value: string): BrandedRevision => `revision:${value}` as BrandedRevision;
export const normalizePolicyCatalogKey = (value: string): BrandedRevision => `revision:${value}` as BrandedRevision;
export const normalizeBlueprintCatalogKey = (input: string): PolicyCatalogName => normalizeCatalogScope(input);

export const withRiskEnvelope = (factor: string, score: number) => ({
  factor: `risk:${factor}` as RiskDimension,
  score,
  severity: score > 0.85 ? 'critical' : score > 0.6 ? 'high' : score > 0.35 ? 'medium' : 'low',
}) as RiskEnvelope;

export const buildBlueprint = <
  TNamespace extends string,
  TStages extends readonly StageContract[] = readonly StageContract[],
  TFocus extends readonly StageName[] = readonly StageName[],
>(
  input: {
    readonly namespace: TNamespace;
    readonly policyId: string;
    readonly strategyId: string;
    readonly tenant: TenantIdentity;
    readonly riskBand: RiskBand;
    readonly stages: TStages;
    readonly notes: string;
    readonly focusStages?: readonly TFocus[number][];
  },
): CascadeBlueprint<TNamespace, TStages, TFocus> => {
  return {
    namespace: `cascade-intel:${input.namespace}` as IntelligenceNamespace<TNamespace>,
    namespaceTag: `policy:${input.namespace}` as PolicyNamespace<TNamespace>,
    policyId: normalizePolicyId(input.policyId),
    strategyId: normalizeStrategyId(input.strategyId),
    tenant: input.tenant,
    riskBand: input.riskBand,
    stages: input.stages,
    notes: input.notes,
    publishedAt: new Date().toISOString(),
    schemaVersion: 'v1.0.0',
    focusStages: (input.focusStages ?? []) as unknown as TFocus,
  };
};

export const cloneBlueprint = <TBlueprint extends CascadeBlueprint>(blueprint: TBlueprint): TBlueprint => ({
  ...blueprint,
  stages: [...blueprint.stages] as TBlueprint['stages'],
  focusStages: [...blueprint.focusStages] as TBlueprint['focusStages'],
  notes: `${blueprint.notes}`,
});

export const mergePolicyDraft = <
  TBlueprint extends CascadeBlueprint,
>(
  draft: PolicyDraft<TBlueprint>,
  patch: NoInfer<Partial<PolicyDraft<TBlueprint>>>,
): PolicyDraft<TBlueprint> => {
  const focus = [...new Set([...draft.focus, ...(patch.focus ?? [])])];
  return {
    ...draft,
    ...patch,
    focus: focus as StageNameFromBlueprintList<TBlueprint>,
  };
};

export type StageNameFromBlueprintList<TBlueprint extends CascadeBlueprint> = readonly StageNameFromManifest<TBlueprint>[];

export const makeTraceKey = (
  tenantId: TenantIdentity['id'],
  plugin: PluginId,
  label: string,
): `trace:${string}` => `trace:${tenantId}:${plugin}:${label}`;

export const tupleFromEdges = <T>(edges: readonly Edge<Brand<string, 'NodeId'>, T>[]): TupleOf<T, 2> =>
  edges.map((edge) => [edge.from, edge.to]).flat() as TupleOf<T, 2>;

export const runSummary = <TBlueprint extends CascadeBlueprint>(run: CascadePolicyRun<TBlueprint>) => ({
  namespace: run.blueprint.namespace,
  stageCount: run.blueprint.stages.map((stage) => stage.name),
});

export const asBlueprintTemplateResult = <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
  edges: readonly StageEdge<StageNameFromManifest<TBlueprint>>[],
): BlueprintTemplateResult<TBlueprint> => ({ blueprint, edges });

export const runToTopology = <TBlueprint extends CascadeBlueprint>(
  run: CascadePolicyRun<TBlueprint>,
): readonly Edge<Brand<string, 'NodeId'>, number>[] =>
  run.blueprint.stages
    .toSorted((left, right) => String(left.name).localeCompare(String(right.name)))
    .map((stage, index) => ({
      from: `${stage.name}` as Brand<string, 'NodeId'>,
      to: (run.runId as unknown) as Brand<string, 'NodeId'>,
      weight: Number(stage.weight) || 1,
      payload: index + 1,
    }));

export const runToTuple = <TBlueprint extends CascadeBlueprint>(run: CascadePolicyRun<TBlueprint>): readonly [string, number] => [
  run.runId,
  run.metrics.length,
];

export const runToString = <TBlueprint extends CascadeBlueprint>(run: CascadePolicyRun<TBlueprint>): string =>
  `${run.runId}:${run.blueprint.namespace}:${run.metrics.length}`;

export const runToStringLegacy = (run: CascadePolicyRun): string =>
  `run:${run.runId}:${run.blueprint.namespace}:${run.status}`;

export const mapConstraintKeys = <T extends Record<string, unknown>>(value: T): {
  [K in keyof T as `constraint:${K & string}`]: T[K];
} => Object.fromEntries(Object.entries(value).map(([key, item]) => [`constraint:${key}`, item])) as {
  [K in keyof T as `constraint:${K & string}`]: T[K];
};

export const mapPathByName = <TBlueprint extends CascadeBlueprint>(value: TBlueprint): Readonly<RecursivePath<TBlueprint>> =>
  value.namespace as RecursivePath<TBlueprint>;

export const mapBlueprintStageMap = <TBlueprint extends CascadeBlueprint>(blueprint: TBlueprint): StageGraph<TBlueprint> => {
  const stageNames = new Set(blueprint.stages.map((stage) => stage.name as string));
  const normalizeDependencyName = (candidate: string): StageNameFromManifest<TBlueprint> => {
    const normalized = candidate.startsWith('stage.')
      ? candidate
      : `stage.${candidate}`;
    return (stageNames.has(normalized)
      ? normalized
      : stageNames.values().next().value
    ) as StageNameFromManifest<TBlueprint>;
  };
  const asManifestName = (candidate: string): StageNameFromManifest<TBlueprint> => candidate as StageNameFromManifest<TBlueprint>;

  const edges = blueprint.stages.toSorted((left, right) => String(left.name).localeCompare(String(right.name))).map(
    (stage) => ({
      from: stage.dependencies.at(-1)
        ? normalizeDependencyName(stage.dependencies.at(-1)!.replace(/^dep:/, ''))
        : asManifestName(stage.name),
      to: stage.name,
      weight: Math.max(1, stage.weight),
      channel: `c:${stage.name}` as `c:${string}`,
    }),
  );
  return {
    namespace: blueprint.namespace,
    edges,
    ordered: blueprint.stages.toSorted((left, right) => String(left.name).localeCompare(String(right.name))).map((stage) => stage.name),
  };
};

export const mapBlueprintStageDependencies = <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
): StageDependencyMap<TBlueprint> => {
  const output = {} as Record<StageNameFromManifest<TBlueprint>, StageDependency[]>;
  for (const stage of blueprint.stages) {
    output[stage.name as StageNameFromManifest<TBlueprint>] = [...stage.dependencies];
  }
  return output as StageDependencyMap<TBlueprint>;
};

export const mapBlueprintStageWeights = <TBlueprint extends CascadeBlueprint>(blueprint: TBlueprint): StageWeightMap => {
  const output: Record<StageName, number> = {};
  for (const stage of blueprint.stages) {
    output[stage.name] = Number(stage.weight) || 0;
  }
  return output as StageWeightMap;
};

export const stageNameFromBlueprint = <TBlueprint extends CascadeBlueprint>(blueprint: TBlueprint): readonly StageNameFromManifest<TBlueprint>[] =>
  blueprint.stages.map((stage) => stage.name);

export const mapBlueprintInputMap = <TBlueprint extends CascadeBlueprint>(blueprint: TBlueprint): StageInputByBlueprint<TBlueprint> => {
  const output = {} as StageInputByBlueprint<TBlueprint>;
  for (const stage of blueprint.stages) {
    output[stage.name as StageNameFromManifest<TBlueprint>] = stage.input as StageInputByBlueprint<TBlueprint>[typeof stage.name];
  }
  return output;
};

export const mapBlueprintOutputMap = <TBlueprint extends CascadeBlueprint>(blueprint: TBlueprint): StageOutputByBlueprint<TBlueprint> => {
  const output = {} as StageOutputByBlueprint<TBlueprint>;
  for (const stage of blueprint.stages) {
    output[stage.name as StageNameFromManifest<TBlueprint>] = stage.output as StageOutputByBlueprint<TBlueprint>[typeof stage.name];
  }
  return output;
};

export const mapBlueprintByName = <TBlueprint extends CascadeBlueprint>(blueprint: TBlueprint): StageGraph<TBlueprint> => {
  const stageNames = new Set(blueprint.stages.map((stage) => stage.name as string));
  const normalizeDependencyName = (candidate: string): StageNameFromManifest<TBlueprint> => {
    const normalized = candidate.startsWith('stage.')
      ? candidate
      : `stage.${candidate}`;
    return (stageNames.has(normalized)
      ? normalized
      : stageNames.values().next().value
    ) as StageNameFromManifest<TBlueprint>;
  };
  const ordered = [...blueprint.stages].map((stage) => stage.name as StageNameFromManifest<TBlueprint>);
  return {
    namespace: blueprint.namespace,
    ordered,
    edges: blueprint.stages.flatMap((stage) =>
      stage.dependencies.map((dependency) => ({
        from: normalizeDependencyName(dependency.replace(/^dep:/, '')),
        to: stage.name as StageNameFromManifest<TBlueprint>,
        weight: Number(stage.weight) || 1,
        channel: `c:${stage.name}` as `c:${string}`,
      })),
    ),
  };
};

export const tupleFromDependencyVector = <TCount extends number>(count: TCount): TupleOf<string, TCount> =>
  Array.from({ length: count }, (_, index) => `dep:${index}`) as TupleOf<string, TCount>;

export const normalizePolicyDraftNotes = (notes: string): string => notes.trim().replace(/\s+/g, ' ').slice(0, 1024);

export const normalizeCatalogSignature = <TBlueprint extends CascadeBlueprint>(blueprint: TBlueprint): CatalogSignature =>
  `${blueprint.namespace}:${blueprint.policyId}:${blueprint.stages.length}` as CatalogSignature;

export const buildBlueprintCatalog = <TBlueprint extends CascadeBlueprint>(blueprint: TBlueprint): PolicyCatalogName =>
  normalizeCatalogScope(`${blueprint.namespace}:${blueprint.policyId}`);

export const inferStageName = <TBlueprint extends CascadeBlueprint, TName extends StageNameFromManifest<TBlueprint>>(
  blueprint: TBlueprint,
): TName => blueprint.stages[0]?.name as TName;

export const normalizeMetric = <TName extends string>(name: TName, value: number, unit: string): MetricObservation<TName> => ({
  name,
  value,
  unit: `unit:${unit}` as `unit:${string}`,
  measuredAt: new Date().toISOString(),
});

export const isHighRisk = (band: RiskBand): band is 'critical' | 'high' => band === 'critical' || band === 'high';
export const asRiskBand = <T extends RiskBand>(value: T): T => value;
export const stageDependencyTag = (stage: StageName): StageDependencyTag => `dep:${stage}` as StageDependencyTag;
export const runToStringFallback = <TBlueprint extends CascadeBlueprint>(run: CascadePolicyRun<TBlueprint>): string =>
  `${run.runId}:${run.status}:${run.blueprint.namespace}`;

export type StageNameFromManifestOrUnknown<TBlueprint extends CascadeBlueprint | undefined> =
  TBlueprint extends CascadeBlueprint ? StageNameFromManifest<TBlueprint> : StageName;
