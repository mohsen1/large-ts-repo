import { Brand, withBrand } from '@shared/core';
import { parsePath as parsePathCore } from '@shared/stress-lab-runtime';

export type Brandify<T, B extends string> = Brand<T, B>;

export type RegionId = Brandify<string, 'RegionId'>;
export type WorkflowNodeId = Brandify<string, 'WorkflowNodeId'>;
export type WorkflowEdgeId = Brandify<string, 'WorkflowEdgeId'>;
export type SignalChannelId = Brandify<string, 'SignalChannelId'>;

export type StressLane =
  | 'observe'
  | 'prepare'
  | 'simulate'
  | 'recommend'
  | 'report'
  | 'restore'
  | 'verify'
  | 'retrospective';

export type Direction = 'northbound' | 'southbound' | 'interlane';

export type NoInfer<T> = [T][T extends any ? 0 : never];

export type PathSegment = `${string}/${string}`;

type PathDepthRec<T extends string, TDepth extends readonly unknown[]> = T extends `${string}/${infer Rest}`
  ? PathDepthRec<Rest, [unknown, ...TDepth]>
  : [...TDepth, unknown]['length'];

export type PathDepth<T extends string> = PathDepthRec<T, [unknown]>;

export type SplitPath<T extends string> = T extends `${infer Head}/${infer Rest}`
  ? [Head, ...SplitPath<Rest>]
  : [T];

export type JoinPath<T extends readonly string[]> = T extends readonly [infer Head extends string, ...infer Rest extends string[]]
  ? Rest extends readonly []
    ? Head
    : `${Head}/${JoinPath<Rest>}`
  : '';

export type RecursiveTupleMap<T extends readonly unknown[], F extends (value: unknown) => unknown> =
  T extends readonly [infer Head, ...infer Rest]
    ? readonly [ReturnType<F> & Head, ...RecursiveTupleMap<Rest, F>]
    : readonly [];

export type RemapByLane<T extends Record<string, unknown>> = {
  [K in keyof T as K extends string ? `lane:${K}` : never]: T[K];
};

export interface WorkloadSignal {
  readonly id: Brandify<string, 'RecoverySignalId'>;
  readonly tenantId: RegionId;
  readonly lane: StressLane;
  readonly phase: 'observe' | 'simulate' | 'recommend';
  readonly score: number;
  readonly createdAt: number;
  readonly source: string;
}

export interface WorkflowNode {
  readonly id: WorkflowNodeId;
  readonly label: string;
  readonly lane: StressLane;
  readonly kind: string;
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
  readonly outputs: readonly WorkflowEdgeId[];
}

export interface WorkflowEdge {
  readonly id: WorkflowEdgeId;
  readonly from: WorkflowNodeId;
  readonly to: readonly WorkflowNodeId[];
  readonly direction: Direction;
  readonly channel: SignalChannelId;
  readonly enabled: boolean;
  readonly latencyBudgetMs: number;
}

export interface WorkflowGraph {
  readonly region: RegionId;
  readonly nodes: readonly WorkflowNode[];
  readonly edges: readonly WorkflowEdge[];
}

export interface LaneTopology {
  readonly lane: StressLane;
  readonly nodes: readonly WorkflowNode[];
  readonly edges: readonly WorkflowEdge[];
  readonly dependencyCount: number;
}

export interface TraversalFrame {
  readonly node: WorkflowNode;
  readonly path: readonly WorkflowNodeId[];
  readonly step: number;
}

export interface GraphInputNode {
  readonly id: string;
  readonly lane: StressLane;
  readonly kind: string;
  readonly outputs: readonly string[];
}

export interface GraphInputEdge {
  readonly id: string;
  readonly from: string;
  readonly to: readonly string[];
  readonly direction: Direction;
  readonly channel: string;
}

export interface GraphInput {
  readonly region: string;
  readonly nodes: readonly GraphInputNode[];
  readonly edges: readonly GraphInputEdge[];
}

const directionWeights = {
  northbound: 0.85,
  interlane: 1.15,
  southbound: 0.95,
} as const satisfies Record<Direction, number>;

export type GraphByLane<TGraph extends WorkflowGraph> = {
  [K in StressLane]: {
    readonly lane: K;
    readonly nodes: Extract<TGraph['nodes'][number], { lane: K }>[];
    readonly edges: TGraph['edges'];
    readonly dependencyCount: number;
  };
};

export type GraphRoute<TPrefix extends string, TPhases extends readonly string[]> =
  TPhases extends readonly [infer Head extends string, ...infer Rest extends readonly string[]]
    ? `${TPrefix}:${Head}:${GraphRoute<TPrefix, Rest>}`
    : `${TPrefix}:terminal`;

export const parsePath = <TPath extends PathSegment>(path: TPath): SplitPath<TPath> => {
  return parsePathCore(path) as SplitPath<TPath>;
};

export const joinPath = <TParts extends readonly string[]>(parts: TParts): JoinPath<TParts> => {
  return parts.join('/') as JoinPath<TParts>;
};

export const pathDepth = <TPath extends PathSegment>(path: TPath): PathDepth<TPath> => {
  return parsePath(path).length as PathDepth<TPath>;
};

export const normalizeGraphInput = (input: GraphInput): WorkflowGraph => {
  const nodeId = (value: string): WorkflowNodeId => withBrand(`${input.region}::${value}`, 'WorkflowNodeId');
  const edgeId = (value: string): WorkflowEdgeId => withBrand(`${input.region}::${value}`, 'WorkflowEdgeId');
  const channelId = (value: string): SignalChannelId => withBrand(`${input.region}::${value}`, 'SignalChannelId');

  const nodes = input.nodes.map((entry) => ({
    id: nodeId(entry.id),
    label: `${entry.lane}:${entry.kind}:${entry.id}`,
    lane: entry.lane,
    kind: entry.kind,
    metadata: { origin: 'normalized', kind: entry.kind },
    outputs: entry.outputs.map((entryOutput) => edgeId(entryOutput)),
  }));

  const edges = input.edges.map((entry) => ({
    id: edgeId(entry.id),
    from: nodeId(entry.from),
    to: entry.to.map((to) => nodeId(to)),
    direction: entry.direction,
    channel: channelId(entry.channel),
    enabled: true,
    latencyBudgetMs: Math.max(1, Math.floor(entry.to.length * 35 * directionWeights[entry.direction])),
  }));

  return {
    region: withBrand(input.region, 'RegionId'),
    nodes,
    edges,
  };
};

export const buildLaneTopology = <TGraph extends WorkflowGraph>(
  graph: TGraph,
  lane: TGraph['nodes'][number]['lane'],
): {
  lane: typeof lane;
  nodes: Extract<TGraph['nodes'][number], { lane: typeof lane }>['kind'][];
  edges: TGraph['edges'];
  dependencyCount: number;
} => {
  const nodeSet = new Set<TGraph['nodes'][number]['id']>(
    graph.nodes.filter((node) => node.lane === lane).map((node) => node.id),
  );
  return {
    lane,
    nodes: graph.nodes.filter((node) => node.lane === lane).map((node) => node.kind as never),
    edges: graph.edges.filter((edge) => nodeSet.has(edge.from)),
    dependencyCount: graph.edges.filter((edge) => nodeSet.has(edge.from)).length,
  };
};

export const buildGraphByLane = <TGraph extends WorkflowGraph>(graph: TGraph): GraphByLane<TGraph> => {
  const byLane: Record<StressLane, { lane: StressLane; nodes: WorkflowNode[]; edges: WorkflowEdge[]; dependencyCount: number }> = {
    observe: { lane: 'observe', nodes: [], edges: [], dependencyCount: 0 },
    prepare: { lane: 'prepare', nodes: [], edges: [], dependencyCount: 0 },
    simulate: { lane: 'simulate', nodes: [], edges: [], dependencyCount: 0 },
    recommend: { lane: 'recommend', nodes: [], edges: [], dependencyCount: 0 },
    report: { lane: 'report', nodes: [], edges: [], dependencyCount: 0 },
    restore: { lane: 'restore', nodes: [], edges: [], dependencyCount: 0 },
    verify: { lane: 'verify', nodes: [], edges: [], dependencyCount: 0 },
    retrospective: { lane: 'retrospective', nodes: [], edges: [], dependencyCount: 0 },
  } satisfies Record<StressLane, LaneTopology>;

  for (const node of graph.nodes) {
    const bucket = byLane[node.lane];
    bucket.nodes.push(node);
    bucket.dependencyCount += node.outputs.length;
  }

  for (const edge of graph.edges) {
    const fromNode = graph.nodes.find((node) => node.id === edge.from);
    if (fromNode) {
      byLane[fromNode.lane].edges.push(edge);
    }
  }

  return byLane as unknown as GraphByLane<TGraph>;
};

const canTraverseEdge = (edge: WorkflowEdge): boolean => edge.enabled && edge.latencyBudgetMs > 0;

export function* traverseGraph<TGraph extends WorkflowGraph>(
  graph: TGraph,
  startNode: WorkflowNodeId,
): Generator<TraversalFrame, void, undefined> {
  const queue: Array<[WorkflowNode, TraversalFrame['path']]> = [];
  const start = graph.nodes.find((node) => node.id === startNode);

  if (!start) {
    return;
  }

  const visited = new Set<string>();
  queue.push([start, [start.id]]);

  while (queue.length > 0) {
    const [node, path] = queue.shift() as [WorkflowNode, readonly WorkflowNodeId[]];
    if (visited.has(node.id)) {
      continue;
    }
    visited.add(node.id);

    const frame: TraversalFrame = { node, path, step: path.length - 1 };
    yield frame;

    const edges = graph.edges.filter((edge) => edge.from === node.id && canTraverseEdge(edge));
    for (const edge of edges) {
      for (const next of edge.to) {
        const nextNode = graph.nodes.find((entry) => entry.id === next);
        if (nextNode) {
          queue.push([nextNode, [...path, next]]);
        }
      }
    }
  }
}

export const collectTraversal = <TGraph extends WorkflowGraph>(
  graph: TGraph,
  startNode?: WorkflowNodeId,
): ReadonlyArray<TraversalFrame> => {
  const start = startNode ?? graph.nodes[0]?.id;
  if (!start) {
    return [] as const;
  }
  return [...traverseGraph(graph, start)] as const;
};

export const traverseGraphLength = <TGraph extends WorkflowGraph>(graph: TGraph, start: WorkflowNodeId): number => {
  return [...traverseGraph(graph, start)].length;
};

export const summarizeByLane = <TGraph extends WorkflowGraph>(graph: TGraph) => {
  return {
    ...summarizeByLaneCount(graph),
  } as const;
};

export const summarizeByLaneCount = <TGraph extends WorkflowGraph>(graph: TGraph): Record<StressLane, number> => {
  const byLane = buildGraphByLane(graph);
  return {
    observe: byLane.observe.nodes.length,
    prepare: byLane.prepare.nodes.length,
    simulate: byLane.simulate.nodes.length,
    recommend: byLane.recommend.nodes.length,
    report: byLane.report.nodes.length,
    restore: byLane.restore.nodes.length,
    verify: byLane.verify.nodes.length,
    retrospective: byLane.retrospective.nodes.length,
  };
};

export const collectByLane = <TGraph extends WorkflowGraph>(
  graph: TGraph,
  lanes: readonly StressLane[],
): Record<StressLane, number> => {
  const signature = summarizeByLaneCount(graph);
  return {
    observe: lanes.includes('observe') ? signature.observe : 0,
    prepare: lanes.includes('prepare') ? signature.prepare : 0,
    simulate: lanes.includes('simulate') ? signature.simulate : 0,
    recommend: lanes.includes('recommend') ? signature.recommend : 0,
    report: lanes.includes('report') ? signature.report : 0,
    restore: lanes.includes('restore') ? signature.restore : 0,
    verify: lanes.includes('verify') ? signature.verify : 0,
    retrospective: lanes.includes('retrospective') ? signature.retrospective : 0,
  };
};

export const routeFromTokens = <T extends readonly string[]>(tokens: T): GraphRoute<'route', T> => {
  return `route:${tokens.join(':')}` as GraphRoute<'route', T>;
};

export const buildRoute = (value: string): string => {
  return joinPath(parsePath(value as PathSegment));
};

export const buildSignalSeries = <TSignals extends readonly string[]>(input: TSignals): ReadonlyArray<NoInfer<TSignals[number]>> => {
  return [...input];
};

export const mapEdgesByDirection = (
  graph: WorkflowGraph,
): {
  readonly northbound: readonly WorkflowEdge[];
  readonly southbound: readonly WorkflowEdge[];
  readonly interlane: readonly WorkflowEdge[];
} => {
  return {
    northbound: graph.edges.filter((entry) => entry.direction === 'northbound'),
    southbound: graph.edges.filter((entry) => entry.direction === 'southbound'),
    interlane: graph.edges.filter((entry) => entry.direction === 'interlane'),
  };
};

export const laneRoute = (lane: StressLane, node: WorkflowNode): string => `${lane}/${node.label}`;

export const graphDigest = (graph: WorkflowGraph): string => {
  const parts = [graph.region, graph.nodes.length, graph.edges.length, summarizeByLane(graph)] as const;
  return JSON.stringify(parts);
};

export const laneCount = (graph: WorkflowGraph, lane: StressLane): number =>
  graph.nodes.reduce((acc, node) => acc + (node.lane === lane ? 1 : 0), 0);

export const withBrandValues = {
  node: (id: string) => withBrand(id, 'WorkflowNodeId'),
  edge: (id: string) => withBrand(id, 'WorkflowEdgeId'),
  channel: (id: string) => withBrand(id, 'SignalChannelId'),
} satisfies Record<'node' | 'edge' | 'channel', (value: string) => string>;

export const buildSignal = (tenantId: RegionId, source: string, phase: WorkloadSignal['phase']): WorkloadSignal => ({
  id: withBrand(`${tenantId}:${source}:${phase}`, 'RecoverySignalId'),
  tenantId,
  lane: phase === 'observe' ? 'observe' : phase === 'simulate' ? 'simulate' : 'recommend',
  phase,
  score: phase === 'recommend' ? 0.9 : 0.5,
  createdAt: Date.now(),
  source,
});

export const buildSignals = <T extends readonly WorkloadSignal[]>(source: string, phase: string): readonly WorkloadSignal[] => {
  const mapped = [] as WorkloadSignal[];
  for (let index = 0; index < 8; index += 1) {
    mapped.push(
      buildSignal(withBrand('tenant-default', 'RegionId'), `${source}:${index}`, index % 3 === 0 ? 'observe' : index % 3 === 1 ? 'simulate' : 'recommend'),
    );
  }
  return mapped;
};

export const signatureByNodeId = (graph: WorkflowGraph): string => {
  const names = graph.nodes.map((node) => node.id);
  return names
    .map((node) => node.toUpperCase())
    .sort()
    .join('::');
};

export const normalizeSignalRoute = <T extends string>(value: T): SplitPath<T> => {
  const normalized = value.length === 0 || !value.includes('/') ? `tenant/${value || 'default'}` : value;
  return normalized.split('/') as SplitPath<T>;
};

export type RemapNodeKinds<T extends Record<string, string>> = {
  [K in keyof T as K extends string ? `node:${K}` : never]: T[K];
};

export const remapNodeKinds = <T extends Record<string, string>>(input: T): RemapNodeKinds<T> => {
  const out = {} as Record<string, string>;
  for (const [key, value] of Object.entries(input)) {
    out[`node:${key}`] = value;
  }
  return out as RemapNodeKinds<T>;
};

export const foldTraversal = <T>(graph: WorkflowGraph, start: WorkflowNodeId, init: T, reducerFn: (seed: T, frame: TraversalFrame) => T): T => {
  return [...traverseGraph(graph, start)].reduce(reducerFn, init);
};

export const graphToString = <TGraph extends WorkflowGraph>(graph: TGraph): string => {
  const rows = graph.nodes.map((node) => `${node.id}:${node.lane}:${node.outputs.length}`).join('|');
  return `${graph.region}::${rows}`;
};

export type PathCursor<T extends readonly string[]> = T extends readonly [infer H extends string, ...infer R extends readonly string[]]
  ? readonly [H, ...PathCursor<R>]
  : readonly [];

export const walkPath = <T extends readonly string[]>(path: T, index: number): PathCursor<T> => {
  return (path.slice(index) as unknown) as PathCursor<T>;
};
