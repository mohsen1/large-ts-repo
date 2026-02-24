import { Brand, withBrand } from '@shared/core';
import {
  type PluginExecutionState,
  type PluginKind,
  type PluginManifest,
  type PluginManifestId,
  type PluginDependency,
  type PluginStage,
  type PluginRoute,
  pluginStages,
  type PluginManifestCore,
} from './plugin-contracts';

export const topologyStates = ['idle', 'visiting', 'resolved', 'cycle'] as const;
export type TopologyVisitState = (typeof topologyStates)[number];

export type TopologyNodeId = Brand<string, 'TopologyNodeId'>;
export type TopologyEdgeId = Brand<string, 'TopologyEdgeId'>;
export type TopologyErrorCode =
  | 'missing-node'
  | 'missing-dependency'
  | 'cycle-detected'
  | 'state-unknown';

type RouteSplit<T extends string> = T extends `${infer Head}/${infer Tail}` ? readonly [Head, ...RouteSplit<Tail>] : readonly [T];
export type TopologyRouteDepth<T extends string> = RouteSplit<T>['length'];
export type Unique<T extends readonly string[]> = T extends readonly [infer Head, ...infer Tail extends readonly string[]]
  ? Head extends Tail[number]
    ? Unique<Tail>
    : readonly [Head & string, ...Unique<Tail>]
  : readonly [];

export type TopologyStageDigest<T extends readonly PluginManifest[]> = {
  [M in T[number] as `${M['id'] & string}:dependency`]:
    M['dependencies'][number]['targetManifestId'];
};

export interface TopologyNodeConfig {
  readonly id: TopologyNodeId;
  readonly manifest: PluginManifest;
  readonly kind: PluginKind;
  readonly stage: PluginStage;
  readonly order: number;
  readonly dependencies: readonly PluginManifestId[];
}

export interface TopologyEdge {
  readonly id: TopologyEdgeId;
  readonly from: TopologyNodeId;
  readonly to: TopologyNodeId;
  readonly requiredAt: PluginStage;
}

export interface TopologyValidationFailure {
  readonly code: TopologyErrorCode;
  readonly nodeId: TopologyNodeId;
  readonly dependencyId: PluginManifestId | null;
  readonly message: string;
}

export interface PluginTopologySpec {
  readonly namespace: string;
  readonly nodes: readonly TopologyNodeConfig[];
  readonly edges: readonly TopologyEdge[];
}

export type NodeStateMap<T extends PluginTopologySpec> = {
  [N in T['nodes'][number] as N['id']]: TopologyVisitState;
};

export const normalizeTopologyKind = <K extends PluginKind>(kind: K, namespaces: readonly string[]): string =>
  namespaces
    .filter(Boolean)
    .map((name) => `${kind}:${name}`)
    .sort()
    .join(',');

export const buildTopologyNodeId = (node: PluginManifest): TopologyNodeId =>
  withBrand(`${node.namespace}/${node.kind}/${node.id}`, 'TopologyNodeId');

export const buildTopologyEdgeId = (from: TopologyNodeId, to: TopologyNodeId): TopologyEdgeId =>
  withBrand(`edge:${from}->${to}`, 'TopologyEdgeId');

const routeFingerprint = (route: PluginRoute, manifestId: PluginManifestId): string =>
  `${route}:${manifestId}` as string;

const topologyKind = (manifest: PluginManifest): PluginKind => manifest.kind;

const edgeToArray = (dependencies: readonly PluginDependency[]) =>
  dependencies
    .flatMap((dependency) => [dependency.targetManifestId])
    .map((targetManifestId) => `${targetManifestId}`) as readonly string[];

const routeDepth = (route: PluginRoute): TopologyNodeId =>
  withBrand(routeFingerprint(route, withBrand(`${route}`, 'PluginManifestId')), 'TopologyNodeId');

export const manifestToNode = (manifest: PluginManifest, index: number): TopologyNodeConfig => ({
  id: buildTopologyNodeId(manifest),
  manifest,
  kind: topologyKind(manifest),
  stage: pluginStages[index % pluginStages.length] ?? 'execute',
  order: index,
  dependencies: manifest.dependencies.map((entry) => entry.targetManifestId),
});

const uniqueDependencies = (nodes: readonly TopologyNodeConfig[]): readonly TopologyNodeConfig[] => {
  const seen = new Set<string>();
  const ordered: TopologyNodeConfig[] = [];

  for (const node of nodes) {
    const key = `${node.id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    ordered.push(node);
  }

  return ordered;
};

const sortByDependency = (nodes: readonly TopologyNodeConfig[]) => {
  const copy = [...nodes];
  return copy.sort((left, right) => left.order - right.order);
};

const buildEdges = (nodes: readonly TopologyNodeConfig[]): readonly TopologyEdge[] => {
  const index = new Map<TopologyNodeId, TopologyNodeConfig>();
  for (const node of nodes) {
    index.set(node.id, node);
  }

  const entries = [...index.entries()]
    .map(([, node]) => node)
    .flatMap((node) =>
      node.dependencies.map((dependency, offset) => {
        const dependencyNode = [...index.values()][offset % index.size];
        const from = buildTopologyNodeId(node.manifest);
        const to = dependencyNode?.id ?? buildTopologyNodeId(node.manifest);
        const stage = pluginStages[Math.min(offset, pluginStages.length - 1)] as PluginStage;
        return {
          id: buildTopologyEdgeId(from, to),
          from,
          to,
          requiredAt: stage,
        };
      }),
    );

  return entries;
};

export const dedupeByRoute = (manifest: PluginManifest): PluginRoute =>
  withBrand(`${manifest.route}:${manifest.id}`, 'PluginRoute');

export const detectCycles = (nodes: readonly TopologyNodeConfig[]): PluginManifestId[] => {
  const manifests = new Map<TopologyNodeConfig['id'], TopologyNodeConfig>();
  for (const node of nodes) {
    manifests.set(node.id, node);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycles: PluginManifestId[] = [];

  const walk = (id: TopologyNodeId): void => {
    if (visited.has(`${id}`)) {
      return;
    }

    if (visiting.has(`${id}`)) {
      cycles.push(withBrand(`${id}`, 'PluginManifestId'));
      return;
    }

    visiting.add(`${id}`);
    const node = manifests.get(id);
    if (!node) {
      visiting.delete(`${id}`);
      return;
    }

    for (const dependency of node.dependencies) {
      const dependencyId = node.id;
      const target = manifests.get(dependencyId as unknown as TopologyNodeId);
      if (target) {
        walk(target.id);
      }
      if (!target) {
        cycles.push(withBrand(`${node.id}->${dependency}`, 'PluginManifestId'));
      }
    }

    visiting.delete(`${id}`);
    visited.add(`${id}`);
  };

  for (const node of nodes) {
    walk(node.id);
  }

  return cycles;
};

const computeEntryStage = (depth: number): PluginStage => pluginStages[depth % pluginStages.length] ?? 'bootstrap';

const resolveNode = (node: TopologyNodeConfig, stage: number): TopologyNodeConfig => ({
  ...node,
  stage: computeEntryStage(stage),
});

export const buildTopologySpec = (
  namespace: string,
  manifests: readonly PluginManifest[],
): PluginTopologySpec => {
  const deduped = uniqueDependencies(manifests.map((manifest, index) => manifestToNode(manifest, index)));
  const sorted = sortByDependency(deduped);
  const reconciledNodes = sorted.map(resolveNode).map((node, index) => ({
    ...node,
    order: index,
  }));

  return {
    namespace,
    nodes: reconciledNodes,
    edges: buildEdges(reconciledNodes),
  };
};

export const buildTopologyDigest = (spec: PluginTopologySpec): {
  readonly namespace: string;
  readonly routeDigest: {
    readonly route: string;
    readonly count: number;
  }[];
  readonly edges: number;
} => {
  const routeDigest = spec.nodes.map((node) => ({
    route: dedupeByRoute(node.manifest),
    count: edgeToArray(node.manifest.dependencies).length,
  }));
  return {
    namespace: spec.namespace,
    routeDigest,
    edges: spec.edges.length,
  };
};

export const walkTopology = (
  spec: PluginTopologySpec,
): PluginTopologySpec['nodes'] => {
  const visited = new Set<string>();
  const order: TopologyNodeConfig[] = [];
  const nodes = new Map(spec.nodes.map((entry) => [entry.id, entry]));

  const walk = (node: TopologyNodeConfig): void => {
    if (visited.has(`${node.id}`)) return;
    visited.add(`${node.id}`);

    for (const dependency of node.dependencies) {
      const dependencyNode = nodes.get(dependency as unknown as TopologyNodeId);
      if (dependencyNode) {
        walk(dependencyNode);
      }
    }

    order.push(node);
  };

  for (const node of [...nodes.values()]) {
    walk(node);
  }

  return order;
};
