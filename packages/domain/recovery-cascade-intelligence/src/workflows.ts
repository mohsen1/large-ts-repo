import { mapBlueprintByName } from './types.js';
import type { NoInfer } from '@shared/type-level';
import type { Brand } from '@shared/core';
import type {
  CascadeBlueprint,
  StageContract,
  StageDependencyTag,
  StageInputByName,
  StageName,
  StageNameFromManifest,
} from './types.js';
import { buildRuntimeManifest, buildStageAliases, inferStageAlias, normalizeManifestScope, toRuntimeManifest } from '@shared/cascade-intelligence-runtime';

export type WorkflowTemplateId = Brand<string, 'WorkflowTemplateId'>;
export type AuditTrail<T extends string = string> = readonly { readonly at: string; readonly event: T; readonly details: string }[];
export type WorkflowPath<TBlueprint extends CascadeBlueprint> = readonly StageNameFromManifest<TBlueprint>[];
export type WorkflowNode<TBlueprint extends CascadeBlueprint> = {
  readonly name: StageNameFromManifest<TBlueprint>;
  readonly input: StageInputByName<TBlueprint, StageNameFromManifest<TBlueprint>>;
  readonly edges: StageDependencyTag[];
};

export interface WorkflowBlueprint<TBlueprint extends CascadeBlueprint> {
  readonly id: WorkflowTemplateId;
  readonly scope: ReturnType<typeof normalizeManifestScope>;
  readonly nodes: readonly WorkflowNode<TBlueprint>[];
  readonly manifest: ReturnType<typeof toRuntimeManifest>;
}

export type WorkflowSlice<TBlueprint extends CascadeBlueprint, TNodes extends readonly WorkflowNode<TBlueprint>[]> = {
  readonly kind: `slice:${TNodes['length']}`;
  readonly nodes: TNodes;
  readonly metadata: {
    readonly count: TNodes['length'];
    readonly scope: WorkflowBlueprint<TBlueprint>['scope'];
    readonly hasCycle: boolean;
  };
};

export type WorkflowEvent = {
  readonly at: string;
  readonly stage: StageName;
  readonly action: 'enqueue' | 'start' | 'finish' | 'skip';
};

export type WorkflowAudit<TBlueprint extends CascadeBlueprint> = {
  readonly id: WorkflowTemplateId;
  readonly blueprint: TBlueprint['namespace'];
  readonly path: WorkflowPath<TBlueprint>;
  readonly trace: AuditTrail<WorkflowEvent['action']>;
};

type StageWeights<TBlueprint extends CascadeBlueprint> = {
  [K in StageNameFromManifest<TBlueprint>]: number;
};

type EventByAction<TAudit extends readonly WorkflowEvent[]> = {
  [Action in WorkflowEvent['action']]: TAudit extends readonly [...any[]]
    ? WorkflowEvent[]
    : never;
};

const normalizeWeight = (value: StageContract['weight']): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0.01, Math.min(1, numeric)) : 1;
};

export const toWorkflowNode = <TBlueprint extends CascadeBlueprint>(
  stage: StageContract,
  blueprint: TBlueprint,
): WorkflowNode<TBlueprint> => ({
  name: stage.name as StageNameFromBlueprint<TBlueprint> as StageNameFromManifest<TBlueprint>,
  input: stage.input as StageInputByName<TBlueprint, StageNameFromManifest<TBlueprint>>,
  edges: stage.dependencies.map((dependency) => `dep:${dependency}` as StageDependencyTag),
});

type StageNameFromBlueprint<TBlueprint extends CascadeBlueprint> =
  TBlueprint extends { readonly stages: readonly (infer TStage)[] }
    ? TStage extends { readonly name: infer TName extends StageName }
      ? TName
      : never
    : never;

export const buildWorkflowBlueprint = <TBlueprint extends CascadeBlueprint>(
  blueprint: NoInfer<TBlueprint>,
): WorkflowBlueprint<TBlueprint> => {
  const graph = mapBlueprintByName(blueprint);
  const nodes = blueprint.stages
    .map((stage) => ({
      name: stage.name,
      input: stage.input as StageInputByName<TBlueprint, StageNameFromManifest<TBlueprint>>,
      edges: stage.dependencies.map((dependency) => `dep:${dependency}` as StageDependencyTag),
    })) satisfies readonly WorkflowNode<TBlueprint>[];

  return {
    id: `workflow:${blueprint.policyId}` as WorkflowTemplateId,
    scope: normalizeManifestScope(blueprint.namespace.replace('cascade-intel:', '')),
    nodes,
    manifest: toRuntimeManifest({
      scope: blueprint.namespace.replace('cascade-intel:', ''),
      template: blueprint.namespace,
      aliases: graph.ordered.slice(0, 2),
    }),
  };
};

export const workflowPlanPath = <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
): WorkflowPath<TBlueprint> => {
  const nodes = mapBlueprintByName(blueprint);
  return [...nodes.ordered] as WorkflowPath<TBlueprint>;
};

export const collectWorkflowWeights = <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
): StageWeights<TBlueprint> => {
  const stages = blueprint.stages.reduce<StageWeights<TBlueprint>>((acc, stage) => {
    acc[stage.name as StageNameFromManifest<TBlueprint>] = normalizeWeight(stage.weight);
    return acc;
  }, {} as StageWeights<TBlueprint>);
  return stages;
};

export const collectWorkflowCoverage = <TBlueprint extends CascadeBlueprint>(blueprint: TBlueprint): EventByAction<[]>
=> {
  const path = workflowPlanPath(blueprint);
  const grouped: EventByAction<[]> = {
    enqueue: path.map((stage) => ({
      at: new Date().toISOString(),
      stage: stage as StageName,
      action: 'enqueue',
    })),
    start: [],
    finish: [],
    skip: [],
  };
  return grouped;
};

export const summarizeWorkflow = <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
): {
  readonly nodeCount: number;
  readonly pathLength: number;
  readonly weightSum: number;
  readonly scope: WorkflowBlueprint<TBlueprint>['scope'];
  readonly aliases: readonly ReturnType<typeof inferStageAlias>[];
} => {
  const path = workflowPlanPath(blueprint);
  const weights = collectWorkflowWeights(blueprint);
  const aliases = buildStageAliases(path);
  const weightSum = path.reduce(
    (sum, stage) => sum + (weights[stage] ?? 0),
    0,
  );
  const manifest = buildRuntimeManifest({
    name: blueprint.namespace,
    scope: String(blueprint.namespace),
    source: `source:${blueprint.namespace}`,
    aliases: path,
    mode: 'adaptive',
  });
  return {
    nodeCount: blueprint.stages.length,
    pathLength: path.length,
    weightSum,
    scope: normalizeManifestScope(blueprint.namespace),
    aliases,
  };
};

export const withAuditTrail = <TBlueprint extends CascadeBlueprint, TResult>(
  blueprint: TBlueprint,
  callback: (audit: WorkflowAudit<TBlueprint>) => TResult,
): TResult => {
  const eventStream = workflowPlanPath(blueprint).toSorted().map((stage) => ({
    at: new Date().toISOString(),
    stage,
    action: 'enqueue' as const,
  }));
  const audit: WorkflowAudit<TBlueprint> = {
    id: `workflow:${blueprint.policyId}` as WorkflowTemplateId,
    blueprint: blueprint.namespace,
    path: workflowPlanPath(blueprint),
    trace: eventStream.map((entry) => ({
      at: entry.at,
      event: entry.action,
      details: `${entry.stage}:${entry.at}`,
    })) as AuditTrail<WorkflowEvent['action']>,
  };
  return callback(audit);
};

export const buildWorkflowSlices = <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
  chunkSize: number,
): readonly WorkflowSlice<TBlueprint, readonly WorkflowNode<TBlueprint>[]>[] => {
  const nodes: readonly WorkflowNode<TBlueprint>[] = blueprint.stages.map((stage) => ({
    name: stage.name as StageNameFromManifest<TBlueprint>,
    input: stage.input as StageInputByName<TBlueprint, StageNameFromManifest<TBlueprint>>,
    edges: stage.dependencies.map((dependency) => `dep:${dependency}` as StageDependencyTag),
  }));
  const chunkLength = Math.max(1, Math.min(8, chunkSize));
  const output: WorkflowSlice<TBlueprint, readonly WorkflowNode<TBlueprint>[]>[] = [];

  for (let cursor = 0; cursor < nodes.length; cursor += chunkLength) {
    const current = nodes.slice(cursor, cursor + chunkLength);
    const path = workflowPlanPath(blueprint);
    output.push({
      kind: `slice:${current.length}` as const,
      nodes: current,
      metadata: {
        count: current.length,
        scope: normalizeManifestScope(blueprint.namespace),
        hasCycle: path.length !== new Set(path).size,
      },
    });
  }

  return output;
};

export const mapWorkflowLayers = <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
): Readonly<Record<string, readonly StageNameFromManifest<TBlueprint>[]>> => {
  const grouped = buildWorkflowSlices(blueprint, 3).reduce<
    Record<string, readonly StageNameFromManifest<TBlueprint>[]>
  >((acc, slice, index) => {
    acc[`layer-${index}`] = slice.nodes.map((node) => node.name);
    return acc;
  }, {});
  return grouped as Readonly<Record<string, readonly StageNameFromManifest<TBlueprint>[]>>;
};

export const createWorkflowCatalogSignature = <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
) => ({
  ...summarizeWorkflow(blueprint),
  namespace: blueprint.namespace,
  layers: mapWorkflowLayers(blueprint),
}) as const;
