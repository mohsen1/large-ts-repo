import type { Graph, Edge, NodeId } from '@shared/core';
import type { PluginStage } from '@domain/recovery-horizon-engine';
import {
  stageWeights,
  collectPluginKinds,
  routeLabel,
  type WorkspaceId,
  type StageRoute,
  type StageRouteByStage,
  type StageCursor,
} from './types.js';

type TopologyNodeId = NodeId & { readonly __namespace?: 'horizon-topology-node' };

type TopologyPath<T extends readonly PluginStage[]> = {
  readonly path: readonly StageRoute<PluginStage>[];
  readonly cursor: StageCursor<T>;
};

interface TopologyNode {
  readonly id: TopologyNodeId;
  readonly stage: PluginStage;
  readonly outgoing: readonly TopologyNodeId[];
}

interface WeightedPath {
  readonly weight: number;
  readonly source: TopologyNodeId;
  readonly target: TopologyNodeId;
}

export interface TopologyStats {
  readonly totalNodes: number;
  readonly totalEdges: number;
  readonly averageOutDegree: number;
}

export interface TopologyBuild<TStages extends readonly PluginStage[]> {
  readonly stages: TStages;
  readonly graph: Graph<TopologyNodeId, { readonly weight: number; readonly route: StageRoute<PluginStage> }>;
  readonly nodes: readonly TopologyNode[];
  readonly paths: readonly TopologyPath<TStages>[];
  readonly stagesByRoute: StageRouteByStage<TStages>;
  readonly pathStages: (limit?: number) => readonly PluginStage[];
}

const unique = <T>(values: readonly T[]) => Array.from(new Set(values));
const stageWeight = (left: PluginStage, right: PluginStage, offset = 1): number => left.length + right.length + offset;
const routeFromStage = <S extends PluginStage>(stage: S, index: number): StageRoute<S> => routeLabel(stage, index);

const makeNodeId = (stage: PluginStage, index: number): TopologyNodeId =>
  `${stage}:${index}` as TopologyNodeId;

const buildEdges = <T extends readonly PluginStage[]>(stages: T, sorted: T): readonly WeightedPath[] =>
  sorted.flatMap((stage, index) => {
    const source = makeNodeId(stage, index);
    return sorted
      .slice(index + 1)
      .map((target, nextOffset) => ({
        weight: stageWeight(stage, target, nextOffset + 1),
        source,
        target: makeNodeId(target, index + nextOffset + 1),
      }));
  });

export const buildTopology = <TStages extends readonly PluginStage[]>(
  stages: TStages,
): TopologyBuild<TStages> => {
  const canonicalStages = collectPluginKinds(stages) as unknown as TStages;
  const weighted = stageWeights(canonicalStages);
  const pathsByStage = canonicalStages.map((stage, index) => ({
    stage,
    index,
    route: routeFromStage(stage, index),
  }));

  const nodes = pathsByStage.map(({ stage, index }) => ({
    id: makeNodeId(stage, index),
    stage,
    outgoing: pathsByStage
      .slice(index + 1)
      .map((entry) => makeNodeId(entry.stage, entry.index))
      .toSorted((left, right) => String(left).localeCompare(String(right))),
  }));

  const edges = buildEdges(canonicalStages, canonicalStages).map((entry): Edge<TopologyNodeId, { readonly weight: number; readonly route: StageRoute<PluginStage> }> => ({
    from: entry.source,
    to: entry.target,
    weight: entry.weight,
    payload: {
      weight: entry.weight,
      route: routeFromStage(canonicalStages[0] ?? 'ingest', 0),
    },
  }));

  const graph: Graph<TopologyNodeId, { readonly weight: number; readonly route: StageRoute<PluginStage> }> = {
    nodes: nodes.map((entry) => entry.id),
    edges,
  };

  const stagesByRoute = weighted.reduce((acc, entry, index) => {
    const route = routeFromStage(entry.stage, index);
    return {
      ...acc,
      [route]: entry.stage,
    };
  }, {} as StageRouteByStage<TStages>);

  const paths = canonicalStages
    .map((_, index) => ({
      path: canonicalStages.slice(index).map((entry, offset) => routeFromStage(entry, offset + index)),
      cursor: { index, stage: canonicalStages[index] ?? 'ingest' },
    }))
    .toSorted((left, right) => left.cursor.index - right.cursor.index);

  return {
    stages: canonicalStages,
    graph,
    nodes,
    paths,
    stagesByRoute,
    pathStages: (limit) => canonicalStages.slice(0, limit ?? canonicalStages.length),
  };
};

export const topologyStats = (topology: TopologyBuild<readonly PluginStage[]>): TopologyStats => {
  const hasEdges = topology.graph.edges.length;
  return {
    totalNodes: topology.nodes.length,
    totalEdges: hasEdges,
    averageOutDegree: hasEdges === 0 ? 0 : hasEdges / topology.nodes.length,
  };
};

export const buildTopologyByWorkspace = <TStages extends readonly PluginStage[]>(
  workspaceId: WorkspaceId,
  stages: TStages,
): TopologyBuild<TStages> => {
  const topology = buildTopology(stages);
  const suffix = String(workspaceId);
  return {
    ...topology,
    stages: topology.stages,
    nodes: topology.nodes.map((entry) => ({
      ...entry,
      id: `${entry.id}:${suffix}` as TopologyNodeId,
    })),
  };
};

export const canonicalStageOrder = stageWeights(['ingest', 'analyze', 'resolve', 'optimize', 'execute']).map(
  (entry) => entry.stage,
);

export const routePairs = (stages: readonly PluginStage[]) => {
  const ordered = unique(stages.toSorted((left, right) => left.localeCompare(right)));
  return ordered.flatMap((entry, index) => {
    if (index + 1 >= ordered.length) {
      return [];
    }
    return [{
      from: routeFromStage(entry, index),
      to: routeFromStage(ordered[index + 1], index + 1),
      weight: stageWeight(entry, ordered[index + 1]),
    }];
  });
};

export const routeSet = (stages: readonly PluginStage[]) =>
  routePairs(stages).toSorted((left, right) => left.from.localeCompare(right.from));
