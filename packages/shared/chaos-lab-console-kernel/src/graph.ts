import type { NoInfer } from '@shared/type-level';
import {
  type ChaosScope,
  type ChaosRunPhase,
  type ChaosRunId,
  type ChaosTenantId,
  type ChaosWorkspaceId,
  type ChaosSignalEnvelope,
  type MetricPoint,
  type ChaosRunMode
} from './types';

export interface WorkloadEdge {
  readonly from: string;
  readonly to: string;
  readonly scope: ChaosScope;
  readonly weight: number;
}

export interface WorkloadGraph {
  readonly workspace: ChaosWorkspaceId;
  readonly tenant: ChaosTenantId;
  readonly edges: readonly WorkloadEdge[];
  readonly mode: ChaosRunMode;
}

export type EdgePath = readonly string[];

export type NodeKey<T extends string> = `${T}:${string}`;

export type GraphNode<T extends string = string> = {
  readonly node: T;
  readonly scope: ChaosScope;
  readonly phase: ChaosRunPhase;
};

export interface WorkloadTopology<T extends readonly GraphNode[]> {
  readonly workspace: ChaosWorkspaceId;
  readonly nodes: T;
  readonly edges: readonly [NodeKey<T[number]['node']>, NodeKey<T[number]['node']>][];
  readonly createdAt: number;
}

export type NodeTuple<T extends readonly GraphNode[]> = {
  [K in keyof T]: T[K] extends GraphNode<infer N>
    ? {
        readonly key: NodeKey<N>;
        readonly scope: T[K]['scope'];
      }
    : never;
}[number];

export type TopologyWeight<T extends readonly WorkloadEdge[]> = T[number] extends infer TEdge
  ? TEdge extends WorkloadEdge
    ? TEdge['weight']
    : never
  : never;

export type TotalWeight<T extends readonly WorkloadEdge[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? Head extends WorkloadEdge
      ? Head['weight'] & number
      : never
    : 0;

export type RecursivePaths<
  T extends WorkloadGraph,
  TStart extends string = string,
  TSeen extends readonly string[] = []
> = T['edges'] extends readonly WorkloadEdge[]
  ? TStart extends string
    ? {
        [K in T['edges'][number]['from']]: K extends TStart
          ? T extends {
              readonly edges: readonly WorkloadEdge[];
            }
            ? [K, ...TSeen]
            : never
          : never
      }
    : never
  : never;

function normalizeWeights(edges: readonly WorkloadEdge[]): readonly WorkloadEdge[] {
  const total = edges.reduce((current, edge) => current + edge.weight, 0);
  return total > 0
    ? edges.map((edge) => ({
      ...edge,
      weight: edge.weight / total
    }))
    : edges;
}

export function createTopology(
  workspace: ChaosWorkspaceId,
  tenant: ChaosTenantId,
  links: readonly WorkloadEdge[],
  mode: ChaosRunMode = 'live'
): WorkloadTopology<readonly GraphNode[]> {
  const nodes = new Map<string, GraphNode>();
  for (const edge of links) {
    const head = nodes.get(edge.from) ?? {
      node: edge.from,
      scope: edge.scope,
      phase: `phase:${edge.scope}` as ChaosRunPhase
    };
    const tail = nodes.get(edge.to) ?? {
      node: edge.to,
      scope: edge.scope,
      phase: `phase:${edge.scope}` as ChaosRunPhase
    };
    nodes.set(edge.from, head);
    nodes.set(edge.to, tail);
  }

  const normalized = normalizeWeights(links);
  return {
    workspace,
    nodes: [...nodes.values()],
    edges: normalized.map((edge) => [
      `${edge.from}` as NodeKey<string>,
      `${edge.to}` as NodeKey<string>
    ]),
    createdAt: Date.now()
  };
}

export function collectReachableNodes(
  graph: WorkloadTopology<readonly GraphNode[]>,
  start: string
): readonly string[] {
  const startSet = new Set<string>(graph.nodes.map((node) => node.node));
  if (!startSet.has(start)) {
    return [];
  }

  const edges = new Map<string, string[]>();
  for (const [from, to] of graph.edges) {
    const existing = edges.get(String(from)) ?? [];
    edges.set(String(from), [...existing, String(to)]);
  }

  const visited = new Set<string>([start]);
  const output: string[] = [start];
  const queue = [start];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    const next = edges.get(current) ?? [];
    for (const target of next) {
      if (!visited.has(target)) {
        visited.add(target);
        output.push(target);
        queue.push(target);
      }
    }
  }

  return output;
}

export function detectCycles(graph: WorkloadTopology<readonly GraphNode[]>): readonly string[] {
  const adjacency = new Map<string, readonly string[]>();
  for (const [from, to] of graph.edges) {
    adjacency.set(String(from), [...(adjacency.get(String(from)) ?? []), String(to)]);
  }

  const path = new Set<string>();
  const visited = new Set<string>();
  const cyclic: string[] = [];

  const visit = (node: string) => {
    if (path.has(node)) {
      cyclic.push(node);
      return;
    }
    if (visited.has(node)) {
      return;
    }
    visited.add(node);
    path.add(node);
    const neighbors = adjacency.get(node) ?? [];
    for (const neighbor of neighbors) {
      visit(neighbor);
    }
    path.delete(node);
  };

  for (const node of graph.nodes) {
    visit(node.node);
  }

  return cyclic;
}

export function toDOT(graph: WorkloadTopology<readonly GraphNode[]>): string {
  const header = ['digraph ChaosTopology {', 'rankdir=LR;'];
  const edges = graph.edges.map(([from, to]) => `  "${from}" -> "${to}";`);
  const nodes = graph.nodes.map((node) => `  "${node.node}" [label="${node.phase}"];`);
  return [...header, ...nodes, ...edges, '}'].join('\n');
}

export function mergeGraphs<TLeft extends WorkloadTopology<readonly GraphNode[]>, TRight extends WorkloadTopology<readonly GraphNode[]>>(
  left: TLeft,
  right: TRight
): WorkloadTopology<readonly GraphNode[]> {
  const mergedNodes = [...left.nodes, ...right.nodes];
  const mergedEdges = [...left.edges, ...right.edges];
  const nodes = mergedNodes.filter(
    (node, index, all) => all.findIndex((next) => next.node === node.node) === index
  );

  return {
    workspace: right.workspace,
    nodes,
    edges: mergedEdges,
    createdAt: Date.now()
  };
}

export function scoreGraph(graph: WorkloadTopology<readonly GraphNode[]>): {
  readonly nodes: number;
  readonly edges: number;
  readonly density: number;
  readonly cycles: readonly string[];
} {
  const nodes = new Set(graph.nodes.map((node) => node.node)).size;
  const edges = graph.edges.length;
  const maxEdges = Math.max(1, nodes * (nodes - 1));
  const cycles = detectCycles(graph);
  return {
    nodes,
    edges,
    density: edges / maxEdges,
    cycles
  };
}

export function* depthFirstWalk(
  graph: WorkloadTopology<readonly GraphNode[]>,
  start: string,
): Generator<ChaosRunPhase, void, void> {
  const edges = new Map<string, string[]>();
  for (const [from, to] of graph.edges) {
    edges.set(from, [...(edges.get(from) ?? []), to]);
  }

  const nodeScope = new Map(graph.nodes.map((node) => [node.node, `phase:${node.scope}` as ChaosRunPhase]));
  const stack: string[] = [start];
  const visited = new Set<string>();

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || visited.has(current)) {
      continue;
    }
    visited.add(current);
    yield nodeScope.get(current) ?? 'phase:ingest';
    for (const next of edges.get(current) ?? []) {
      stack.push(next);
    }
  }
}

export function emitRunTrace(
  runs: readonly ChaosRunId[],
  graph: WorkloadTopology<readonly GraphNode[]>,
  signals: readonly ChaosSignalEnvelope[]
): readonly { readonly runId: ChaosRunId; readonly timeline: readonly ChaosRunPhase[] }[] {
  const byRun = new Map<string, ChaosRunPhase[]>();
  for (const runId of runs) {
    const phases: ChaosRunPhase[] = [];
    for (const phase of depthFirstWalk(graph, String(runId))) {
      phases.push(phase);
    }
    byRun.set(String(runId), phases);
  }

  return runs.map((runId) => {
    const timeline = byRun.get(String(runId)) ?? [];
    return {
      runId,
      timeline: [...timeline, ...signals.filter((signal) => signal.id.includes(String(runId))).map((signal) => signal.kind.split('::')[0] as ChaosRunPhase)]
    } as const;
  });
}

export function buildMetricMap(metrics: readonly MetricPoint[]): Readonly<Record<string, number>> {
  const output: Record<string, number> = {};
  for (const metric of metrics) {
    output[metric.name] = metric.score as number;
  }
  return output;
}
