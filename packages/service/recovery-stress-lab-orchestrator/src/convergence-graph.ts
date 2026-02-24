import { createWorkloadId, type WorkloadTopologyNode, type WorkloadTopologyEdge } from '@domain/recovery-stress-lab';
import {
  type ConvergenceScope,
  type ConvergenceOutput,
  type ConvergenceRunId,
  type ConvergenceStage,
} from '@domain/recovery-lab-orchestration-core';

export type ReadonlyPair<TLeft, TRight> = readonly [TLeft, TRight];

export type EdgeWeight = number & { readonly __brand: 'EdgeWeight' };

export interface RuntimeTopologyNode {
  readonly id: WorkloadTopologyNode['id'];
  readonly scope: ConvergenceScope;
  readonly stage: ConvergenceStage;
  readonly stageTrail: readonly ConvergenceStage[];
}

export interface RuntimeTopologyEdge {
  readonly from: WorkloadTopologyNode['id'];
  readonly to: WorkloadTopologyNode['id'];
  readonly weight: EdgeWeight;
  readonly reason: string;
}

export interface RuntimeGraph {
  readonly runId: ConvergenceRunId;
  readonly nodes: readonly RuntimeTopologyNode[];
  readonly edges: readonly RuntimeTopologyEdge[];
  readonly metadata: {
    readonly scope: ConvergenceScope;
    readonly confidence: number;
    readonly score: number;
  };
}

export type TopologyAccumulator<TNodes extends readonly RuntimeTopologyNode[] = readonly RuntimeTopologyNode[]> = {
  readonly nodes: TNodes;
  readonly edges: readonly RuntimeTopologyEdge[];
  readonly score: number;
};

export type RoutePath<T extends readonly RuntimeTopologyNode[]> = T extends readonly [infer Head extends RuntimeTopologyNode, ...infer Tail extends RuntimeTopologyNode[]]
  ? [Head['id'], ...RoutePath<Tail>]
  : readonly [];

export const toEdgeWeight = (value: number): EdgeWeight => {
  const safe = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  return safe as EdgeWeight;
};

export const buildNode = (runId: ConvergenceRunId, scope: ConvergenceScope, stage: ConvergenceStage, index: number): RuntimeTopologyNode => ({
  id: createWorkloadId(`${runId}:${scope}:${stage}:${index}`),
  scope,
  stage,
  stageTrail: [stage],
});

export const buildEdge = (
  from: WorkloadTopologyNode['id'],
  to: WorkloadTopologyNode['id'],
  reason: string,
  weight: number,
): RuntimeTopologyEdge => ({
  from,
  to,
  reason,
  weight: toEdgeWeight(weight),
});

export const inferGraphFromEdges = <
  const TScope extends ConvergenceScope,
>(
  runId: ConvergenceRunId,
  scope: TScope,
  outputs: readonly ConvergenceOutput[],
): RuntimeGraph => {
  const seed = buildNode(runId, scope, outputs[0]?.stage ?? 'input', 0);
  const nodes = outputs.reduce<TopologyAccumulator<readonly RuntimeTopologyNode[]>>(
    (acc, output, index) => {
      const previous = acc.nodes.at(-1) ?? seed;
      const current = buildNode(runId, scope, output.stage, index + 1);
      const edge = buildEdge(previous.id, current.id, `${scope}:${output.stage}`, output.confidence);

      const nextScore = acc.score + output.score;
      return {
        nodes: [...acc.nodes, current],
        edges: [...acc.edges, edge],
        score: nextScore,
      };
    },
    {
      nodes: [seed],
      edges: [],
      score: 0,
    },
  );

  const maxScore = Math.max(1, outputs.length);
  return {
    runId,
    nodes: nodes.nodes,
    edges: nodes.edges,
    metadata: {
      scope,
      confidence: nodes.score / maxScore,
      score: nodes.score,
    },
  };
};

export const topologyDigest = (graph: RuntimeGraph): string => {
  const route = [...graph.edges].map((edge) => `${edge.from}->${edge.to}:${edge.weight}`).join('|');
  return `${graph.runId}:${graph.metadata.scope}:${route.length}`;
};

export const projectScope = <TScope extends ConvergenceScope>(graph: RuntimeGraph, scope: TScope): readonly RuntimeTopologyNode[] =>
  graph.nodes.filter((node) => node.scope === scope);

export const pickOutputByStage = <TGraph extends RuntimeGraph>(graph: TGraph, stage: ConvergenceStage): RuntimeTopologyNode | undefined =>
  graph.nodes.find((node) => node.stage === stage);

export const sortTopologyNodes = <TNodes extends readonly RuntimeTopologyNode[]>(nodes: TNodes): TNodes => {
  const sorted = [...nodes].toSorted((left, right) => left.stage.localeCompare(right.stage));
  return sorted as unknown as TNodes;
};

export const routeAsIds = <TNodes extends readonly RuntimeTopologyNode[]>(nodes: TNodes): RoutePath<TNodes> => {
  const ids = nodes.map((node) => node.id) as RoutePath<TNodes>;
  return ids;
};

export const mapTopologyEdges = (
  topology: RuntimeGraph,
  mapWeight: (weight: EdgeWeight, reason: string) => EdgeWeight,
): readonly RuntimeTopologyEdge[] =>
  topology.edges.map((edge) => ({
    ...edge,
    weight: mapWeight(edge.weight, edge.reason),
  }));

export const toGraphFromTopology = (runId: ConvergenceRunId, scope: ConvergenceScope, topology: readonly WorkloadTopologyNode[]): RuntimeGraph => {
  const nodes = topology.map((node, index): RuntimeTopologyNode => ({
    id: node.id,
    scope,
    stage: index % 2 === 0 ? 'input' : 'simulate',
    stageTrail: index % 2 === 0 ? (['input', 'resolve'] as const) : (['input', 'simulate'] as const),
  }));

  const edges = topology.slice(0, -1).flatMap((node, index) => {
    const next = topology[index + 1];
    if (!next) return [] as ReadonlyArray<RuntimeTopologyEdge>;
    return [
      {
        from: node.id,
        to: next.id,
        weight: toEdgeWeight(((index + 1) / Math.max(1, topology.length)).toFixed(3) as unknown as number),
        reason: `topology:${node.ownerTeam}:${index}`,
      },
    ];
  });

  return {
    runId,
    nodes,
    edges,
    metadata: {
      scope,
      confidence: 0.7,
      score: nodes.length,
    },
  };
};

export const toTopologyEdgeRecords = (graph: RuntimeGraph): readonly WorkloadTopologyEdge[] =>
  graph.edges.map((edge) => ({
    from: edge.from,
    to: edge.to,
    coupling: edge.weight,
    reason: edge.reason,
  }));
