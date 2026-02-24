import { withBrand } from '@shared/core';
import { NoInfer } from '@shared/type-level';
import {
  type MeshNodeContract,
  type MeshNodeId,
  type MeshPathTuple,
  type MeshPlanId,
  type MeshSignalKind,
  type MeshTopology,
  type MeshTopologyPath,
  type MeshTopologyEdge,
} from './types';

export type RouteSignalKind = MeshSignalKind;
export type RouteState = 'pending' | 'active' | 'stable' | 'invalid';

export type RouteTemplate<T extends MeshTopologyPath[] = MeshTopologyPath[]> = {
  readonly label: string;
  readonly tokens: readonly T[number][];
};

export type RoutePlanId = string & { readonly __brand: 'MeshSignalRoutePlanId' };
export type RoutedPath<T extends RouteSignalKind = RouteSignalKind> = `route:${T}`;

export type RouteRecord<TKind extends RouteSignalKind = RouteSignalKind> = {
  readonly routeId: RoutePlanId;
  readonly kind: TKind;
  readonly nodes: readonly MeshNodeId[];
  readonly state: RouteState;
};

export interface RouteOptions<TTopology extends MeshTopology = MeshTopology> {
  readonly topology: TTopology;
  readonly seed: string;
  readonly includeTelemetry: boolean;
  readonly minDepth: number;
}

export interface RouteSummary {
  readonly routeCount: number;
  readonly activeKinds: readonly RouteSignalKind[];
  readonly labels: readonly string[];
}

export interface RouteSearchConfig {
  readonly kind?: RouteSignalKind;
  readonly maxDepth?: number;
  readonly includeSignals: boolean;
}

export type RouteIndex = ReadonlyMap<MeshNodeId, ReadonlySet<RouteSignalKind>>;

const routeLabel = (kind: RouteSignalKind, id: MeshNodeId, depth: number): RoutedPath<RouteSignalKind> =>
  `route:${kind}:${id}:${depth}` as RoutedPath<RouteSignalKind>;

export const buildRouteIndex = <TTopology extends MeshTopology>(
  topology: TTopology,
  includeSignalKinds: readonly RouteSignalKind[] = ['pulse', 'snapshot', 'alert', 'telemetry'],
): RouteIndex => {
  const map = new Map<MeshNodeId, Set<RouteSignalKind>>();

  for (const edge of topology.links) {
    for (const signal of includeSignalKinds) {
      const channels = edge.channels.includes(`mesh-signal:${signal}`);
      if (!channels) {
        continue;
      }

      const bucket = map.get(edge.from) ?? new Set<RouteSignalKind>();
      bucket.add(signal);
      map.set(edge.from, bucket);
    }
  }

  const frozen = new Map<MeshNodeId, ReadonlySet<RouteSignalKind>>();
  for (const [key, value] of map.entries()) {
    frozen.set(key, new Set(value));
  }
  return frozen;
};

export const discoverRoutes = <
  TTopology extends MeshTopology,
  TSeed extends readonly MeshTopologyPath[] = readonly MeshTopologyPath[],
>(
  options: NoInfer<RouteOptions<TTopology>>,
  ...seed: NoInfer<TSeed>
): readonly MeshTopologyPath[] => {
  const maxDepth = Math.max(0, options.minDepth);
  const start = options.topology.nodes[0]?.id;
  if (!start) {
    return [];
  }

  const routes = new Set<MeshTopologyPath>();
  const routeSeeds = [...seed] as readonly MeshTopologyPath[];

  for (const signal of ['pulse', 'snapshot', 'alert', 'telemetry'] as const) {
    const out = traverseNodes(options.topology, start, signal, maxDepth)
      .map((nodeId) => `${nodeId}:${signal}:${options.seed}` as MeshTopologyPath);
    for (const path of out) {
      routes.add(path);
    }
  }

  const seedPaths = routeSeeds.toSorted();
  return [...routes, ...seedPaths].toSorted();
};

const traverseNodes = (
  topology: MeshTopology,
  start: MeshNodeId,
  signal: RouteSignalKind,
  maxDepth: number,
): readonly MeshNodeId[] => {
  const queue: Array<{ readonly id: MeshNodeId; readonly depth: number }> = [{ id: start, depth: 0 }];
  const seen = new Set<MeshNodeId>([start]);
  const out: MeshNodeId[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    if (current.depth >= maxDepth) {
      continue;
    }

    const outgoing = topology.links.filter((edge) => edge.from === current.id && edge.channels.includes(`mesh-signal:${signal}`));
    if (outgoing.length === 0) {
      continue;
    }

    for (const edge of outgoing) {
      if (!seen.has(edge.to)) {
        seen.add(edge.to);
        out.push(edge.to);
        queue.push({ id: edge.to, depth: current.depth + 1 });
      }
    }
  }

  return out;
};

export class MeshSignalRoutes<TTopology extends MeshTopology> {
  readonly #planId: RoutePlanId;
  readonly #topology: TTopology;
  readonly #index: RouteIndex;

  constructor(topology: NoInfer<TTopology>, planId: MeshPlanId, includeSignals: readonly RouteSignalKind[] = ['pulse', 'snapshot', 'alert', 'telemetry']) {
    this.#planId = withBrand(`${planId}:${includeSignals.join(',')}`, 'MeshSignalRoutePlanId');
    this.#topology = topology;
    this.#index = buildRouteIndex(topology, includeSignals);
  }

  get id() {
    return this.#planId;
  }

  get topology() {
    return this.#topology;
  }

  select = (config: RouteSearchConfig): readonly RouteRecord[] => {
    const nodes = this.#topology.nodes.filter((node): node is MeshNodeContract => {
      const kinds = this.#index.get(node.id);
      if (!kinds) {
        return false;
      }

      if (config.kind && !kinds.has(config.kind)) {
        return false;
      }

      return kinds.size > 0;
    });

    return nodes.map((node, index) => ({
      routeId: withBrand(`${this.#planId}:${index}`, 'MeshSignalRoutePlanId'),
      kind: config.kind ?? 'pulse',
      nodes: [node.id],
      state: node.maxConcurrency > 0 ? 'active' : 'pending',
    }));
  };

  trace = (signal: RouteSignalKind, maxDepth = 3): RouteSummary => {
    const selected = this.select({ kind: signal, includeSignals: true, maxDepth });

    const seenNodes = new Set<MeshNodeId>();
    for (const entry of selected) {
      for (const node of entry.nodes) {
        seenNodes.add(node);
      }
    }

    return {
      routeCount: selected.length,
      activeKinds: Array.from(new Set(selected.map((entry) => entry.kind))).toSorted(),
      labels: Array.from(seenNodes, (id) => `${routeLabel(signal, id, maxDepth)}`),
    };
  };
}

export const routeForTopology = <TTopology extends MeshTopology>(
  topology: TTopology,
  kind: RouteSignalKind,
): readonly MeshTopologyPath[] =>
  discoverRoutes(
    { topology, seed: 'quick', includeTelemetry: true, minDepth: 1 },
    `${topology.id}` as MeshTopologyPath,
    `${kind}-seed` as MeshTopologyPath,
  );

export const summarizeRoutePaths = (links: readonly MeshTopologyEdge[]): RouteSummary => {
  const byFrom = new Map<MeshNodeId, number>();
  for (const edge of links) {
    byFrom.set(edge.from, (byFrom.get(edge.from) ?? 0) + 1);
  }

  return {
    routeCount: links.length,
    activeKinds: ['pulse', 'snapshot', 'alert', 'telemetry'],
    labels: [...byFrom.entries()].map(([key, count]) => `${key}:${count}`),
  };
};

export const routeSummaryByKinds = (kinds: readonly RouteSignalKind[]): RouteSummary => ({
  routeCount: kinds.length,
  activeKinds: kinds,
  labels: kinds.map((kind) => `${kind}:summary`).toSorted(),
});
