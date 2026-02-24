import { asLabPluginId, type LabPluginId, type PluginKind, pluginPhaseRanks } from '@shared/recovery-lab-kernel';
import type { LabLane } from './models';

export type RouteSegment<T extends string> = T extends `${infer Head}/${infer Tail}`
  ? Head | `${Head}/${RouteSegment<Tail>}`
  : T;

export type TemplatePath<TParts extends readonly string[]> = TParts extends readonly [infer Head, ...infer Tail]
  ? Head extends string
    ? readonly [Head, ...RouteSegment<Head> extends never ? [] : TemplatePath<Extract<Tail, readonly string[]>>]
    : never
  : readonly [];

export interface SimulationNode {
  readonly id: string;
  readonly lane: LabLane;
  readonly pluginId: LabPluginId;
  readonly tags: readonly string[];
}

export interface SimulationEdge {
  readonly from: string;
  readonly to: string;
  readonly weight: number;
}

export interface SimulationTopology {
  readonly nodes: readonly SimulationNode[];
  readonly edges: readonly SimulationEdge[];
}

export const sortByRank = (kindA: PluginKind, kindB: PluginKind): number => pluginPhaseRanks[kindA] - pluginPhaseRanks[kindB];

export const createTopology = (
  lane: LabLane,
  pluginIds: readonly string[],
): SimulationTopology => {
  const nodes = pluginIds.map((id, index) => ({
    id: `${lane}-${index}`,
    lane,
    pluginId: asLabPluginId(`${lane}-${id}`),
    tags: [lane, `node-${index}`],
  }));

  const edges = nodes
    .toSorted((left, right) => sortByRank('transform', 'observe') + left.id.localeCompare(right.id))
    .flatMap((node, index, sortedNodes) => {
      const next = sortedNodes[index + 1];
      if (!next) {
        return [] as const;
      }
      return [
        {
          from: node.id,
          to: next.id,
          weight: 1 + (index % 3),
        },
      ];
    });

  return { nodes, edges };
};

export const buildRouteMap = (topology: SimulationTopology): ReadonlyMap<string, readonly string[]> => {
  const route = new Map<string, string[]>();
  for (const edge of topology.edges) {
    const existing = route.get(edge.from) ?? [];
    route.set(edge.from, [...existing, edge.to]);
  }
  return route;
};

export const routeTraversal = (routes: ReadonlyMap<string, readonly string[]>, from: string): readonly string[] => {
  const visited = new Set<string>();
  const out: string[] = [];
  const walk = (current: string): void => {
    if (visited.has(current)) {
      return;
    }
    visited.add(current);
    out.push(current);
    for (const next of routes.get(current) ?? []) {
      walk(next);
    }
  };
  walk(from);
  return out;
};
