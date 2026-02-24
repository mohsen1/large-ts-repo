import type { WorkloadTopology, WorkloadTopologyNode, WorkloadTopologyEdge } from '@domain/recovery-stress-lab';
import { type ConvergenceConstraint, type ConvergenceStage } from './types';

export interface TopologyRoute {
  readonly from: WorkloadTopologyNode['id'];
  readonly to: WorkloadTopologyNode['id'];
  readonly hops: number;
  readonly path: readonly WorkloadTopologyNode['id'][];
}

export interface RouteInput {
  readonly topology: WorkloadTopology;
  readonly maxHops?: number;
}

export interface RouteScore {
  readonly totalEdges: number;
  readonly averageCoupling: number;
  readonly routeCount: number;
}

export type ConstraintBucket<T extends readonly ConvergenceConstraint[]> = {
  readonly [K in T[number] as K['scope']]: {
    readonly totalWeight: number;
    readonly items: readonly K[];
  };
};

const toNodeMap = (topology: WorkloadTopology): ReadonlyMap<string, WorkloadTopologyNode> => {
  const map = new Map<string, WorkloadTopologyNode>();
  for (const node of topology.nodes) {
    map.set(node.id, node);
  }
  return map;
};

const adjacency = (topology: WorkloadTopology): Map<WorkloadTopologyNode['id'], WorkloadTopologyEdge[]> => {
  const edges = new Map<WorkloadTopologyNode['id'], WorkloadTopologyEdge[]>();
  for (const edge of topology.edges) {
    const bucket = edges.get(edge.from) ?? [];
    bucket.push(edge);
    edges.set(edge.from, bucket);
  }
  return edges;
};

const normalizeMaxHops = (maxHops?: number): number => {
  if (maxHops === undefined || maxHops < 1) return 4;
  if (!Number.isFinite(maxHops)) return 4;
  return Math.max(1, Math.floor(maxHops));
};

const discoverRoutes = (
  start: WorkloadTopologyNode['id'],
  topology: WorkloadTopology,
  maxHops: number,
): TopologyRoute[] => {
  const graph = adjacency(topology);
  const nodes = toNodeMap(topology);
  const startNode = nodes.get(start);
  if (!startNode) return [];

  const visited = new Set<string>([startNode.id]);
  const queue: Array<{ readonly current: WorkloadTopologyNode['id']; readonly depth: number; readonly path: readonly WorkloadTopologyNode['id'][] }> = [
    { current: startNode.id, depth: 0, path: [startNode.id] },
  ];
  const routes: TopologyRoute[] = [];

  while (queue.length > 0) {
    const entry = queue.shift();
    if (!entry) continue;
    if (entry.depth >= maxHops) continue;

    for (const edge of graph.get(entry.current) ?? []) {
      const nextDepth = entry.depth + 1;
      if (visited.has(edge.to)) continue;

      const nextPath = [...entry.path, edge.to] as readonly WorkloadTopologyNode['id'][];
      visited.add(edge.to);
      queue.push({ current: edge.to, depth: nextDepth, path: nextPath });

      if (nextDepth >= 2) {
        routes.push({
          from: startNode.id,
          to: edge.to,
          hops: nextDepth,
          path: nextPath,
        });
      }
    }
  }

  return routes;
};

const byScore = (input: WorkloadTopology, stage: ConvergenceStage): number => {
  const coupling = input.edges.reduce((acc, edge) => acc + edge.coupling, 0);
  const multiplier = stage === 'simulate' ? 1.2 : stage === 'recommend' ? 0.8 : 1;
  return (coupling / Math.max(1, input.edges.length)) * multiplier;
};

export const buildTopologySnapshot = ({ topology, maxHops }: RouteInput): {
  readonly routes: readonly TopologyRoute[];
  readonly score: RouteScore;
} => {
  const max = normalizeMaxHops(maxHops);
  const routes = topology.nodes.flatMap((node) => discoverRoutes(node.id, topology, max));

  const score: RouteScore = {
    totalEdges: topology.edges.length,
    averageCoupling: byScore(topology, 'simulate'),
    routeCount: routes.length,
  };

  return {
    routes,
    score,
  };
};

export const routeByScope = (snapshot: { readonly routes: readonly TopologyRoute[] }, stage: ConvergenceStage): readonly TopologyRoute[] => {
  return snapshot.routes.filter((route) => {
    if (stage === 'input') return route.hops <= 1;
    if (stage === 'resolve') return route.hops <= 2;
    if (stage === 'recommend') return route.hops <= 3;
    return route.hops >= 1;
  });
};

export const buildRouteByScope = (
  topology: WorkloadTopology,
  constraints: readonly ConvergenceConstraint[],
): {
  readonly snapshot: ReturnType<typeof buildTopologySnapshot>;
  readonly filteredBySignal: readonly TopologyRoute[];
} => {
  const snapshot = buildTopologySnapshot({ topology, maxHops: 6 });
  const filteredBySignal = routeByScope(snapshot, constraints.some((constraint) => constraint.scope === 'signal') ? 'simulate' : 'resolve');

  return {
    snapshot,
    filteredBySignal,
  };
};
