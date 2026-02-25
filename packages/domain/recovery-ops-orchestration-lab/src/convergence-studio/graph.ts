import type { ConvergencePluginDescriptor, ConvergenceStage } from './types';

export interface StudioNode {
  readonly id: string;
  readonly stage: ConvergenceStage;
  readonly pluginId: string;
  readonly children: readonly string[];
}

export interface StudioRoute {
  readonly from: string;
  readonly to: string;
  readonly depth: number;
}

export interface StudioTopologyInput {
  readonly plugins: readonly ConvergencePluginDescriptor[];
  readonly maxDepth?: number;
}

export type PluginAdjacency = ReadonlyMap<string, ReadonlySet<string>>;

const asNodes = (plugins: readonly ConvergencePluginDescriptor[]): readonly StudioNode[] => {
  return plugins.map((plugin, index) => ({
    id: plugin.id,
    stage: plugin.stage,
    pluginId: `${plugin.name}-${index}`,
    children: plugin.dependsOn,
  }));
};

const buildIncoming = (nodes: readonly StudioNode[]): Map<string, number> => {
  const incoming = new Map<string, number>();
  for (const node of nodes) {
    incoming.set(node.id, incoming.get(node.id) ?? 0);
    for (const child of node.children) {
      incoming.set(child, (incoming.get(child) ?? 0) + 1);
    }
  }
  return incoming;
};

export const buildAdjacency = (plugins: readonly ConvergencePluginDescriptor[]): PluginAdjacency => {
  const byId = asNodes(plugins);
  const map = new Map<string, Set<string>>();
  for (const node of byId) {
    map.set(node.id, new Set(node.children));
  }
  return map;
};

export const traverseTopology = (plugins: readonly ConvergencePluginDescriptor[]): readonly StudioTopologyInput[] => {
  const adjacency = buildAdjacency(plugins);
  const nodes = asNodes(plugins);
  const incoming = buildIncoming(nodes);
  const queue: string[] = [...incoming.entries()].filter(([, degree]) => degree === 0).map(([id]) => id);
  const visited = new Set<string>();
  const order: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    order.push(current);

    const next = adjacency.get(current);
    if (!next) continue;
    for (const child of next) {
      const remaining = (incoming.get(child) ?? 0) - 1;
      incoming.set(child, Math.max(0, remaining));
      if (remaining <= 0) {
        queue.push(child);
      }
    }
  }

  const byStage = new Map<ConvergenceStage, string[]>();
  for (const node of nodes) {
    const bucket = byStage.get(node.stage) ?? [];
    bucket.push(node.id);
    byStage.set(node.stage, bucket);
  }

  return [...byStage.entries()].map(([stage, pluginIds]) => ({
    plugins: plugins.filter((plugin) => pluginIdMatch(plugin, pluginIds)),
    maxDepth: pluginIds.length,
    // keep stage as key for caller transforms
  } as unknown as StudioTopologyInput));
};

const pluginIdMatch = (plugin: ConvergencePluginDescriptor, list: readonly string[]): boolean => {
  return list.includes(plugin.id);
};

export const routeFrom = (input: StudioTopologyInput, from: string, depth = 0): readonly StudioRoute[] => {
  const adjacency = buildAdjacency(input.plugins);
  const seen = new Set<string>([from]);
  const frontier = input.plugins.filter((plugin) => plugin.id === from);
  const result: StudioRoute[] = [];

  let current = [...frontier];
  let currentDepth = 0;
  while (current.length > 0 && currentDepth < Math.max(1, depth)) {
    const next: ConvergencePluginDescriptor[] = [];
    for (const source of current) {
      for (const target of adjacency.get(source.id) ?? new Set()) {
        if (seen.has(target)) continue;
        result.push({ from: source.id, to: target, depth: currentDepth + 1 });
        const targetNode = input.plugins.find((plugin) => plugin.id === target);
        if (targetNode) {
          next.push(targetNode);
          seen.add(target);
        }
      }
    }
    current = next;
    currentDepth += 1;
  }

  return result;
};

export const topologySignature = (input: StudioTopologyInput): string => {
  const pluginSignature = input.plugins
    .map((plugin) => `${plugin.id}:${plugin.stage}`)
    .toSorted()
    .join('|');

  return `${pluginSignature}::${input.maxDepth ?? 0}`;
};
