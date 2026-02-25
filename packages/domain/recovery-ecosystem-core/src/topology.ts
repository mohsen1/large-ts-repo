import {
  type RoutePath,
  type GraphNodeId,
  type RouteSegment,
  type WorkflowNode,
  type WorkflowEdge,
  WorkflowGraph,
  buildRouteText,
  buildPayloadPath,
} from '@shared/typed-orchestration-core';
import type { NamespaceTag, StageId, TenantId, RunId } from './identifiers';
import type { LifecyclePhase, StageConfig, StageDependency, StageStateBase, StageSnapshot } from './models';
import { buildDependencyMatrix } from './models';
import { asStageId } from './identifiers';

export interface EcosystemRoute<TPayload extends readonly RouteSegment[] = readonly RouteSegment[]> {
  readonly steps: readonly StageStep[];
  readonly payloadMap: ReturnType<typeof buildPayloadPath<Record<string, unknown>>>;
  readonly diagnostics: {
    readonly route: RoutePath<TPayload>;
    readonly nodes: number;
  };
}

export interface StageStep {
  readonly stageId: StageId;
  readonly plugin: string;
  readonly order: number;
}

export type StageEvent<TScope extends string> = {
  readonly kind: `event:${TScope}`;
  readonly at: string;
  readonly runId: RunId;
  readonly tenant: TenantId;
  readonly namespace: NamespaceTag;
  readonly payload: {
    readonly stageId: StageId;
    readonly status: LifecyclePhase;
    readonly metrics: number;
  };
};

const sortedDependencies = (dependencies: readonly StageDependency[]): StageDependency[] =>
  [...dependencies].toSorted((left, right) => right.weight - left.weight);

const asNodeId = (stage: StageId): GraphNodeId => `node:${stage}` as GraphNodeId;

export const buildDependencyGraph = (stageConfig: readonly StageConfig[]) => {
  const nodes: WorkflowNode[] = stageConfig.map((stage) => ({
    id: asNodeId(stage.id),
    payload: {
      id: stage.id,
      name: stage.name,
      plugin: stage.plugin,
      tags: stage.tags,
      timeout: stage.timeoutMs,
      severity: stage.severity,
    },
  }));

  const edges = stageConfig.flatMap((stage) =>
    stage.dependsOn.map((dependency) => ({
      from: asNodeId(dependency),
      to: asNodeId(stage.id),
      weight: stage.timeoutMs / 1000 + stage.retries,
    })),
  ) as readonly WorkflowEdge[];

  return { nodes, edges };
};

export const buildRunTopology = <TPayload extends Record<string, unknown>>(
  namespace: NamespaceTag,
  stages: readonly StageConfig[],
  initialPayload: TPayload,
): EcosystemRoute<readonly ['namespace', 'events', 'snapshots']> => {
  const graphInput = buildDependencyGraph(stages);
  const graph = new WorkflowGraph(graphInput.nodes, graphInput.edges);
  const sorted = sortedDependencies(
    stages.flatMap((stage) =>
      stage.dependsOn.map((dependency) => ({
        from: dependency,
        to: stage.id,
        reason: `${dependency}->${stage.id}`,
        weight: stage.timeoutMs,
      })),
    ),
  );

  const matrix = buildDependencyMatrix(sorted);
  const ordered = graph.nodes().map((node, index) => {
    const key = node.id.replace('node:', '');
    return {
      stageId: asStageId(key),
      plugin: `plugin:${key}`,
      order: index,
    };
  });

  const diagnostics = {
    route: buildRouteText(graph) as RoutePath<readonly ['namespace', 'events', 'snapshots']>,
    nodes: graph.nodes().length,
  };

  const payloadMap = buildPayloadPath(
    Object.fromEntries([
      ...Object.entries(matrix).map(([key, value]) => [key, value.length]),
      ...Object.entries(initialPayload).map(([key, value]) => [key, String(value)]),
      ['namespace', namespace],
    ] as const) as Record<string, unknown>,
  ) as ReturnType<typeof buildPayloadPath<Readonly<Record<string, unknown>>>>;

  return {
    steps: ordered,
    payloadMap,
    diagnostics,
  };
};

export const extractRouteSignals = (states: readonly StageStateBase[]): readonly {
  readonly event: string;
  readonly count: number;
  readonly unit: string;
}[] =>
  states.flatMap((state) =>
    state.metrics.map((metric) => ({
      event: metric.name,
      count: metric.value,
      unit: metric.unit,
    })),
  );

export const buildStageEvents = (namespace: NamespaceTag, runId: RunId, tenant: TenantId, stages: readonly StageSnapshot[]): {
  readonly records: readonly StageEvent<'stage'>[];
  readonly summary: string;
} => {
  const records = stages.flatMap((snapshot) => {
    const event: StageEvent<'stage'> = {
      kind: 'event:stage',
      at: snapshot.startedAt,
      runId,
      tenant,
      namespace,
      payload: {
        stageId: snapshot.id,
        status: snapshot.status,
        metrics: snapshot.metrics.length,
      },
    };
    return [event];
  });

  return {
    records,
    summary: `records:${records.length}`,
  };
};
