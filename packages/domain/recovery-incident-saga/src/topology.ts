import type { Graph } from '@shared/core';
import { withBrand } from '@shared/core';
import type { SagaGraphNodeId, SagaPolicy, SagaPlan, SagaRunStepId } from './model';

interface Adjacency {
  readonly from: SagaGraphNodeId;
  readonly to: SagaGraphNodeId;
}

export interface TopologyNode {
  readonly id: SagaGraphNodeId;
  readonly rank: number;
  readonly inbound: SagaGraphNodeId[];
  readonly outbound: SagaGraphNodeId[];
}

export interface TopologyResult {
  readonly nodes: readonly TopologyNode[];
  readonly order: readonly SagaGraphNodeId[];
  readonly cycleDetected: boolean;
}

type GraphMap = Map<SagaGraphNodeId, Set<SagaGraphNodeId>>;

const addNode = (index: GraphMap, node: SagaGraphNodeId): void => {
  if (!index.has(node)) {
    index.set(node, new Set());
  }
};

const addEdge = (index: GraphMap, edge: Adjacency): void => {
  addNode(index, edge.from);
  addNode(index, edge.to);
  const targets = index.get(edge.from);
  if (targets) {
    targets.add(edge.to);
  }
};

const flattenGraph = (graph: GraphMap, nodes: readonly SagaGraphNodeId[]): readonly TopologyNode[] => {
  const nodeEntries = Array.from(graph.entries());
  return nodeEntries.map(([node, targets], index) => ({
    id: node,
    rank: index,
    inbound: [],
    outbound: [...targets],
    _source: nodes,
  } as TopologyNode & { _source: readonly SagaGraphNodeId[] }));
};

const detectCycles = (index: GraphMap): boolean => {
  const stack = new Set<SagaGraphNodeId>();
  const visited = new Set<SagaGraphNodeId>();
  let cycle = false;

  const visit = (node: SagaGraphNodeId): void => {
    if (cycle) return;
    if (stack.has(node)) {
      cycle = true;
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    stack.add(node);

    for (const next of index.get(node) ?? []) {
      visit(next);
    }
    stack.delete(node);
  };

  for (const node of index.keys()) {
    if (!visited.has(node)) {
      visit(node);
    }
  }

  return cycle;
};

const topoSort = (index: GraphMap): SagaGraphNodeId[] => {
  const inDegree = new Map<SagaGraphNodeId, number>();
  for (const node of index.keys()) {
    inDegree.set(node, 0);
  }
  for (const from of index.values()) {
    for (const to of from) {
      const degree = inDegree.get(to) ?? 0;
      inDegree.set(to, degree + 1);
    }
  }

  const ready: SagaGraphNodeId[] = [...inDegree.entries()].flatMap(([node, degree]) => (degree === 0 ? [node] : []));
  const order: SagaGraphNodeId[] = [];

  while (ready.length > 0) {
    const current = ready.shift();
    if (!current) break;
    order.push(current);
    for (const next of index.get(current) ?? []) {
      const nextDegree = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, nextDegree);
      if (nextDegree === 0) {
        ready.push(next);
      }
    }
  }

  return order;
};

const enrichInbound = (nodes: TopologyNode[], index: GraphMap): TopologyNode[] => {
  const byId = new Map<SagaGraphNodeId, TopologyNode>();
  for (const node of nodes) {
    byId.set(node.id, { ...node, inbound: [] });
  }
  for (const [from, targets] of index.entries()) {
    for (const to of targets) {
      const inboundNode = byId.get(to);
      if (inboundNode) {
        inboundNode.inbound.push(from);
      }
    }
  }
  return nodes.map((node) => byId.get(node.id) ?? node);
};

export const buildTopology = (plan: SagaPlan): TopologyResult => {
  const index: GraphMap = new Map();
  const toNodeId = (stepId: SagaRunStepId): SagaGraphNodeId => withBrand(`${stepId}`, 'NodeId');
  const stepNodes = plan.steps.map((step) => toNodeId(step.id));
  for (const [from, to] of plan.edges) {
    addEdge(index, { from: toNodeId(from), to: toNodeId(to) });
  }

  const cycleDetected = detectCycles(index);
  const order = topoSort(index);
  const baseNodes = flattenGraph(index, stepNodes).map((node) => {
    const asNode = node as TopologyNode & { _source: readonly SagaGraphNodeId[] };
    return {
      id: asNode.id,
      rank: asNode.rank,
      inbound: asNode.inbound,
      outbound: asNode.outbound,
    } as TopologyNode;
  });
  const nodes = enrichInbound(baseNodes, index);

  return {
    nodes: nodes.map((node) => ({ ...node })),
    order,
    cycleDetected,
  };
};

export const mapTopologyByNode = (topology: TopologyResult): ReadonlyMap<SagaGraphNodeId, TopologyNode> =>
  new Map(topology.nodes.map((node) => [node.id, node]));

export const nodeWithMostEdges = (topology: TopologyResult): TopologyNode | undefined =>
  [...topology.nodes].sort((left, right) => right.outbound.length - left.outbound.length).at(0);

export function* walkTopology(topology: TopologyResult): Generator<SagaGraphNodeId> {
  for (const id of topology.order) {
    yield id;
  }
}

export const topologyContains = (topology: TopologyResult, nodeId: SagaGraphNodeId): boolean =>
  topology.nodes.some((node) => node.id === nodeId);

export const summarizeTopology = (topology: TopologyResult, policy?: SagaPolicy): string =>
  `${(policy?.name ?? 'untitled')}|nodes=${topology.nodes.length}|cycle=${topology.cycleDetected}`;

export const topologyToGraph = (topology: TopologyResult): Graph<SagaGraphNodeId, number> => ({
  nodes: topology.order,
  edges: topology.order.flatMap((from) =>
    topology.nodes
      .find((node) => node.id === from)
      ?.outbound.map((to) => ({
        from,
        to,
        weight: 1,
      })) ?? [],
  ),
});
