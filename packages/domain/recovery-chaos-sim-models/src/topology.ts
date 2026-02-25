import { type Brand } from '@shared/type-level';

export type NodeFlavor = 'ingress' | 'compute' | 'storage' | 'network' | 'control';
export type NodeState = 'ready' | 'degraded' | 'draining' | 'failed' | 'recovering';
export type NodeLabel<T extends string = string> = `${Lowercase<T>}.${NodeFlavor}`;

export type WeightedEdge = Brand<number, 'WeightedEdge'>;
export type TopologyRunId = Brand<string, 'TopologyRunId'>;

export interface TopologyNode<TName extends string = string> {
  readonly id: NodeLabel<TName>;
  readonly label: TName;
  readonly flavor: NodeFlavor;
  readonly state: NodeState;
  readonly capacity: number;
}

export interface TopologyEdge<TFlavor extends NodeFlavor = NodeFlavor> {
  readonly from: NodeLabel;
  readonly to: NodeLabel;
  readonly weight: number;
  readonly active: boolean;
  readonly flavor: TFlavor;
}

export type TopologyRoute<
  TNode extends string = string,
  TChain extends readonly string[] = readonly string[]
> = TChain extends readonly [infer Head extends string, ...infer Tail extends readonly string[]]
  ? `${TNode}:${Head}` | TopologyRoute<TNode, Tail>
  : never;

export type NodeMap<T extends readonly TopologyNode<string>[]> = {
  [K in T[number] as K['id']]: K;
};

export type EdgeMap<TEdges extends readonly TopologyEdge[]> = {
  [K in TEdges[number] as K['from'] & string]: ReadonlyArray<TEdges[number]>;
};

export type ReachableFrom<
  TEdges extends readonly TopologyEdge[],
  TFrom extends TEdges[number]['from']
> = TEdges[number] extends infer Edge
  ? Edge extends { from: TFrom; to: infer TTo }
    ? TTo
    : never
  : never;

export type GraphSignature<TNodes extends readonly TopologyNode<string>[]> =
  `nodes:${TNodes[number]['id']}` & Brand<string, 'GraphSignature'>;

export interface TopologyPlan<TNodes extends readonly TopologyNode<string>[], TEdges extends readonly TopologyEdge[]> {
  readonly runId: TopologyRunId;
  readonly nodes: TNodes;
  readonly edges: TEdges;
  readonly selected: readonly TopologyNode<TNodes[number]['label']>[];
}

export interface TopologyMutation<TNodes extends readonly TopologyNode<string>[], TEdges extends readonly TopologyEdge[]> {
  readonly runId: TopologyRunId;
  readonly addNodes: readonly NodeLabel<
    TNodes[number]['label']
  >[];
  readonly removeNodes: readonly NodeLabel<
    TNodes[number]['label']
  >[];
  readonly addEdges: readonly TopologyEdge[];
  readonly removeEdgeIds: readonly string[];
}

export function asWeightedEdge(weight: number): WeightedEdge {
  const safe = Number.isFinite(weight) ? Math.max(0, weight) : 0;
  return safe as WeightedEdge;
}

export function nodeRoute<T extends NodeFlavor>(prefix: T, name: string): NodeLabel<string> {
  return `${name.toLowerCase()}.${prefix}` as NodeLabel;
}

export function computeEdgeIndex<TEdges extends readonly TopologyEdge[]>(
  edges: TEdges
): ReadonlyMap<TopologyEdge['from'], ReadonlyArray<TopologyEdge>> {
  const map = new Map<TopologyEdge['from'], ReadonlyArray<TopologyEdge>>();
  for (const edge of edges) {
    const current = map.get(edge.from) ?? [];
    map.set(edge.from, [...current, edge]);
  }
  return map;
}

export function connectedComponents<TNodes extends readonly TopologyNode<string>[]>(
  nodes: TNodes,
  edges: readonly TopologyEdge[]
): readonly ReadonlyArray<TNodes[number]['id']>[] {
  const index = new Map<string, Set<string>>();
  for (const node of nodes) {
    index.set(node.id, new Set());
  }

  for (const edge of edges) {
    index.get(edge.from)?.add(edge.to);
    index.get(edge.to)?.add(edge.from);
  }

  const visited = new Set<string>();
  const components: string[][] = [];

  for (const node of nodes) {
    if (visited.has(node.id)) {
      continue;
    }
    const stack: string[] = [node.id];
    const component: string[] = [];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || visited.has(current)) {
        continue;
      }
      visited.add(current);
      component.push(current);
      const neighbors = [...(index.get(current) ?? [])];
      for (const next of neighbors) {
        if (!visited.has(next)) {
          stack.push(next);
        }
      }
    }
    components.push(component);
  }

  const signature = components as Array<TNodes[number]['id']>[];
  return signature.map((component) => component as ReadonlyArray<TNodes[number]['id']>);
}

export function normalizeTopology<TNodes extends readonly TopologyNode<string>[], TEdges extends readonly TopologyEdge[]>(
  nodes: TNodes,
  edges: TEdges
): TopologyPlan<TNodes, TEdges> {
  const runId = `topology-${Date.now()}` as TopologyRunId;
  const selected = nodes.filter((node) => node.state !== 'failed') as unknown as TopologyPlan<TNodes, TEdges>['selected'];
  return {
    runId,
    nodes,
    edges,
    selected
  };
}

export function pruneTopology<TNodes extends readonly TopologyNode<string>[], TEdges extends readonly TopologyEdge[]>(
  plan: TopologyPlan<TNodes, TEdges>,
  threshold: number
): TopologyPlan<TNodes, TEdges> {
  const filteredEdges = plan.edges.filter((edge) => edge.weight >= threshold) as unknown as TEdges;
  const activeNodes = plan.nodes.filter((node) => node.state === 'ready' || node.state === 'recovering') as unknown as TNodes;
  return {
    ...plan,
    nodes: activeNodes as TNodes,
    edges: filteredEdges,
    selected: plan.selected
  };
}

export type PathBuilder<TEdges extends readonly TopologyEdge[]> =
  TEdges extends readonly [infer Head extends TopologyEdge, ...infer Tail extends readonly TopologyEdge[]]
    ? readonly [Head['from'], ...PathBuilder<Tail>]
    : readonly [];

export function pathFromEdges<
  TEdges extends readonly TopologyEdge[]
>(edges: TEdges): PathBuilder<TEdges> {
  return edges.map((edge) => edge.from) as unknown as PathBuilder<TEdges>;
}
