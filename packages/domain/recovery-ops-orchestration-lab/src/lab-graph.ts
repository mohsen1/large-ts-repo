import type { JsonValue } from '@shared/type-level';
import type { OrchestrationLab, LabStep, LabPlan } from './types';

export type GraphNodeId = `${string}::${string}`;
export type GraphEdgeType = 'dependency' | 'control' | 'data' | 'rollback';

export interface LabGraphNode {
  readonly id: GraphNodeId;
  readonly label: string;
  readonly step?: LabStep;
  readonly metadata: Record<string, JsonValue>;
}

export interface LabGraphEdge {
  readonly from: GraphNodeId;
  readonly to: GraphNodeId;
  readonly kind: GraphEdgeType;
  readonly weight: number;
  readonly notes: readonly string[];
}

export interface LabGraphSnapshot {
  readonly labId: OrchestrationLab['id'];
  readonly nodes: readonly LabGraphNode[];
  readonly edges: readonly LabGraphEdge[];
}

export interface GraphPath<TNode extends string = string> {
  readonly steps: readonly TNode[];
  readonly score: number;
}

export interface GraphDiagnostics {
  readonly cycleCount: number;
  readonly disconnectedNodeCount: number;
  readonly maxDepth: number;
  readonly pathCount: number;
}

export type NodeSelector = `node:${string}`;

export type PathTuple<TPath extends readonly unknown[]> =
  TPath extends readonly [infer Head, ...infer Tail]
    ? readonly [Head, ...PathTuple<Tail>]
    : readonly [];

export type SegmentToPath<T extends string> = T extends `${infer Head}/${infer Rest}`
  ? readonly [Head, ...SegmentToPath<Rest>]
  : readonly [T];

export type RouteLabel<T extends string> = T extends `${infer Left}:${infer Right}`
  ? `${Capitalize<Lowercase<Left>>}::${Right}`
  : `route::${T}`;

export type KeyedPayload<T extends Record<string, JsonValue>> = {
  readonly [K in keyof T as `${string & K}`]: T[K];
};

export type MergePathKeys<T extends readonly string[]> = {
  readonly [P in T[number]]: P;
};

export type RecursivelyFoldedNodeMap = Record<string, LabGraphNode>;

const toNodeId = (planId: OrchestrationLab['id'], stepId: string): GraphNodeId => `${planId}::${stepId}`;

const normalizeNotes = (notes: readonly string[]): readonly string[] => [...new Set(notes)].toSorted();

const buildNodes = (lab: OrchestrationLab): readonly LabGraphNode[] =>
  lab.plans.flatMap((plan) =>
    plan.steps.map((step) => ({
      id: toNodeId(lab.id, `${plan.id}::${step.id}`),
      label: `${plan.title}:${step.name}`,
      step,
      metadata: {
        planId: plan.id,
        stepType: step.type,
        risk: step.risk,
      },
    })),
  );

const buildEdges = (lab: OrchestrationLab): readonly LabGraphEdge[] => {
  const edges: LabGraphEdge[] = [];

  for (const plan of lab.plans) {
    for (const step of plan.steps) {
      const from = toNodeId(lab.id, `${plan.id}::${step.id}`);
      const dependencyNotes = step.dependencies.map((dependency) =>
        `depends:${dependency.from}->${dependency.to}:${dependency.reason}`,
      );

      for (const dependency of step.dependencies) {
        edges.push({
          from,
          to: toNodeId(lab.id, `${plan.id}::${dependency.to}`),
          kind: 'dependency',
          weight: 1 + dependency.from.length,
          notes: dependencyNotes,
        });
      }

      if (step.reversible) {
        edges.push({
          from,
          to: from,
          kind: 'rollback',
          weight: 2,
          notes: ['reversible'],
        });
      }

      for (const tag of step.tags) {
        edges.push({
          from,
          to: from,
          kind: 'data',
          weight: Math.max(1, tag.length),
          notes: [`tag:${tag}`],
        });
      }
    }
  }

  return dedupeEdges(edges);
};

const dedupeEdges = (edges: readonly LabGraphEdge[]): readonly LabGraphEdge[] => {
  const index = new Map<string, LabGraphEdge>();
  for (const edge of edges) {
    const key = `${edge.from}->${edge.to}:${edge.kind}`;
    index.set(key, {
      ...edge,
      notes: normalizeNotes(edge.notes),
    });
  }
  return [...index.values()];
};

const adjacency = (edges: readonly LabGraphEdge[]): ReadonlyMap<GraphNodeId, readonly GraphNodeId[]> => {
  const out = new Map<GraphNodeId, GraphNodeId[]>();
  for (const edge of edges) {
    const existing = out.get(edge.from) ?? [];
    existing.push(edge.to);
    out.set(edge.from, existing);
  }
  return out;
};

const topological = (nodes: readonly LabGraphNode[], edges: readonly LabGraphEdge[]): readonly GraphNodeId[] => {
  const adjacencyByFrom = adjacency(edges);
  const visited = new Set<GraphNodeId>();
  const sorted: GraphNodeId[] = [];

  const visit = (nodeId: GraphNodeId, stack: readonly GraphNodeId[]): void => {
    if (visited.has(nodeId)) {
      return;
    }

    visited.add(nodeId);
    const next = adjacencyByFrom.get(nodeId) ?? [];
    for (const candidate of next) {
      if (stack.includes(candidate)) {
        return;
      }
      visit(candidate, [...stack, nodeId]);
    }
    sorted.push(nodeId);
  };

  for (const node of nodes) {
    visit(node.id, []);
  }

  return sorted;
};

const detectCycles = (nodes: readonly LabGraphNode[], edges: readonly LabGraphEdge[]): number => {
  const edgesByFrom = adjacency(edges);
  let cycleCount = 0;
  const inPath = new Set<GraphNodeId>();

  const walk = (nodeId: GraphNodeId): void => {
    if (inPath.has(nodeId)) {
      cycleCount += 1;
      return;
    }

    inPath.add(nodeId);
    for (const to of edgesByFrom.get(nodeId) ?? []) {
      walk(to);
    }
    inPath.delete(nodeId);
  };

  for (const node of nodes) {
    walk(node.id);
  }

  return cycleCount;
};

const reachable = (
  source: GraphNodeId,
  adjacencyByFrom: ReadonlyMap<GraphNodeId, readonly GraphNodeId[]>,
): readonly GraphNodeId[] => {
  const seen = new Set<GraphNodeId>([source]);
  const queue: GraphNodeId[] = [source];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    for (const to of adjacencyByFrom.get(current) ?? []) {
      if (!seen.has(to)) {
        seen.add(to);
        queue.push(to);
      }
    }
  }

  return [...seen];
};

export const buildLabGraph = (lab: OrchestrationLab): LabGraphSnapshot => {
  const nodes = buildNodes(lab);
  const edges = buildEdges(lab);

  return {
    labId: lab.id,
    nodes: nodes.map((node) => ({
      ...node,
      metadata: {
        ...node.metadata,
        connectedOut: edges.filter((edge) => edge.from === node.id).length,
      },
    })),
    edges,
  };
};

const scorePath = <T extends readonly GraphNodeId[]>(path: T): GraphPath<T[number]> => ({
  steps: path,
  score: path.length,
});

export const pathVariants = <
  const TPaths extends readonly (readonly GraphNodeId[])[],
>(paths: TPaths): readonly GraphPath<GraphNodeId>[] => {
  const flattened = paths.map((path) => scorePath(path as readonly GraphNodeId[]));
  return flattened.toSorted((left, right) => right.score - left.score);
};

export const buildGraphDiagnostics = (graph: LabGraphSnapshot): GraphDiagnostics => {
  const _topological = topological(graph.nodes, graph.edges);
  const adjacencyByFrom = adjacency(graph.edges);
  const disconnected = graph.nodes.filter((node) => {
    const connectedOut = adjacencyByFrom.get(node.id) ?? [];
    const hasIncoming = graph.edges.some((edge) => edge.to === node.id);
    const hasOutgoing = connectedOut.length > 0;
    return !hasIncoming && !hasOutgoing;
  });

  const cycleCount = detectCycles(graph.nodes, graph.edges);
  const pathCount = pathVariants(graph.nodes.map((node) => [node.id] as const)).length;

  const maxDepth = [...graph.nodes]
    .map((node) => reachable(node.id, adjacencyByFrom).length)
    .reduce((acc, depth) => Math.max(acc, depth), 0);

  return {
    cycleCount,
    disconnectedNodeCount: disconnected.length,
    maxDepth,
    pathCount,
  };
};

export const nodeSelector = <T extends string>(prefix: T, index: number): NodeSelector => `node:${prefix}-${index}`;

export const mergeGraphPayload = <T extends Record<string, JsonValue>>(payload: T): KeyedPayload<T> => {
  return payload as unknown as KeyedPayload<T>;
};

export const toSegmentPath = <TPath extends string>(path: TPath): PathTuple<SegmentToPath<TPath>> => {
  return path.split('/') as unknown as PathTuple<SegmentToPath<TPath>>;
};

export const inferRouteLabel = <TPath extends string>(path: TPath): RouteLabel<TPath> => (
  `${path}` as RouteLabel<TPath>
);

export const buildRouteMap = (paths: readonly string[]): MergePathKeys<readonly string[]> => {
  return paths.reduce<MergePathKeys<readonly string[]>>((acc, current) => {
    const currentValue = inferRouteLabel(current);
    return {
      ...acc,
      [currentValue]: current,
    } as MergePathKeys<readonly string[]>;
  }, {} as MergePathKeys<readonly string[]>);
};

export const collectGraphNodes = (
  nodes: readonly LabGraphNode[],
): RecursivelyFoldedNodeMap => {
  const accumulator: RecursivelyFoldedNodeMap = {};

  for (const node of nodes) {
    accumulator[String(node.id)] = node;
  }

  return accumulator;
};

export const describeRoute = (plan: OrchestrationLab): string => {
  const labels = buildGraphDiagnostics(buildLabGraph(plan));
  return `lab=${plan.id} cycles=${labels.cycleCount} maxDepth=${labels.maxDepth} disconnected=${labels.disconnectedNodeCount}`;
};

export const collectPlanGraphNodes = (plan: LabPlan): readonly GraphNodeId[] =>
  plan.steps.map((step) => toNodeId(plan.labId, `${plan.id}::${step.id}`));
