import {
  type AutomationBlueprint,
  type AutomationBlueprintStep,
  type AutomationStage,
  type AutomationTier,
  type PluginId,
  buildDefaultBlueprint,
  type RecoveryCockpitPluginDescriptor,
} from './automationBlueprint';

export type FlowNodeId = `node:${string}`;
export type FlowEdge = Readonly<{
  readonly from: FlowNodeId;
  readonly to: FlowNodeId;
  readonly condition: 'always' | 'on-success' | 'on-failure';
  readonly weight: number;
}>;

export type FlowNode = Readonly<{
  readonly nodeId: FlowNodeId;
  readonly stage: AutomationStage;
  readonly pluginId: PluginId;
  readonly stepId: FlowNode['nodeId'];
  readonly edges: readonly FlowEdge[];
}>;

export type FlowGraph = ReadonlyMap<FlowNodeId, FlowNode>;

export type FlowPath = Readonly<{
  readonly nodes: readonly FlowNodeId[];
  readonly route: string;
  readonly weight: number;
}>;

export type TopologyDigest = {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly paths: readonly FlowPath[];
  readonly stageCounts: Readonly<Record<AutomationStage, number>>;
};

const iteratorFrom =
  (globalThis as {
    readonly Iterator?: {
      readonly from?: <T>(value: Iterable<T>) => { toArray(): T[]; map<U>(selector: (value: T) => U): { toArray(): U[] } };
    };
  }).Iterator?.from;

const toArray = <T>(value: Iterable<T>): T[] => iteratorFrom?.(value)?.toArray() ?? [...value];

const defaultEdgeWeight = (index: number): number => {
  if (index < 0) return 0;
  return Math.min(100, 35 + index * 13);
};

const toEdge = (from: FlowNodeId, to: FlowNodeId, condition: FlowEdge['condition'], weight: number): FlowEdge => ({
  from,
  to,
  condition,
  weight,
});

const routeFromNodePath = (path: readonly FlowNode[]): string => path.map((node) => `${node.stage}:${node.pluginId}`).join(' -> ');

export const buildNodesFromBlueprint = <TDescriptor extends RecoveryCockpitPluginDescriptor<PluginId, AutomationStage>>(
  blueprint: AutomationBlueprint<TDescriptor>,
): readonly FlowNode[] => {
  return blueprint.steps.map((step, index) => ({
    nodeId: `node:${step.stepId}` as FlowNodeId,
    stepId: `node:${step.stepId}` as FlowNode['nodeId'],
    stage: step.plugin.stage,
    pluginId: step.plugin.pluginId,
    edges: step.dependsOn.map((dependency, offset) => {
      const from = `node:${dependency}` as FlowNodeId;
      const to = `node:${step.stepId}` as FlowNodeId;
      return toEdge(from, to, offset % 2 === 0 ? 'on-success' : 'always', defaultEdgeWeight(index + offset));
    }),
  }));
};

const rootNodes = (nodes: readonly FlowNode[]): readonly FlowNode[] => {
  const targets = new Set<string>(nodes.flatMap((node) => node.edges.map((edge) => edge.to)));
  return nodes.filter((node) => !targets.has(node.nodeId));
};

const walkPaths = (nodes: readonly FlowNode[], current: readonly FlowNode[], visited: ReadonlySet<string>): readonly FlowPath[] => {
  const last = current.at(-1);
  if (!last) return [];

  const mapBySource = new Map<string, FlowNode[]>();
  for (const source of nodes) {
    for (const edge of source.edges) {
      const target = nodes.find((next) => next.nodeId === edge.to);
      if (!target) continue;
      const bucket = mapBySource.get(edge.from) ?? [];
      bucket.push(target);
      mapBySource.set(edge.from, bucket);
    }
  }

  const next = mapBySource.get(last.nodeId) ?? [];
  if (next.length === 0) {
    return [
      {
        nodes: current.map((entry) => entry.nodeId),
        route: routeFromNodePath(current),
        weight: current.reduce((sum, item) => sum + item.edges.length * 10, 0),
      },
    ];
  }

  if (visited.has(last.nodeId)) {
    return [];
  }

  const updated = new Set(visited);
  updated.add(last.nodeId);
  return next.flatMap((candidate) =>
    visited.has(candidate.nodeId) ? [] : walkPaths(nodes, [...current, candidate], updated),
  );
};

export const buildTopology = (nodes: readonly FlowNode[]): FlowGraph => {
  const map = new Map<FlowNodeId, FlowNode>();
  for (const node of nodes) {
    map.set(node.nodeId, node);
  }
  return map;
};

export const buildTopologyDigest = (nodes: readonly FlowNode[]): TopologyDigest => {
  const byStage = {
    discover: 0,
    compose: 0,
    execute: 0,
    verify: 0,
    audit: 0,
  } as Record<AutomationStage, number>;

  for (const node of nodes) {
    byStage[node.stage] += 1;
  }

  const byRoot = rootNodes(nodes).flatMap((root) => walkPaths(nodes, [root], new Set()));
  const paths = toArray(byRoot);

  return {
    nodeCount: nodes.length,
    edgeCount: nodes.reduce((sum, node) => sum + node.edges.length, 0),
    paths,
    stageCounts: byStage,
  };
};

export const summarizeTopology = (nodes: readonly FlowNode[]): string => {
  const digest = buildTopologyDigest(nodes);
  return `nodes=${digest.nodeCount}; edges=${digest.edgeCount}; routes=${digest.paths.length}`;
};

export const deriveOrderedSteps = (
  blueprint: AutomationBlueprint<RecoveryCockpitPluginDescriptor<PluginId, AutomationStage>>,
): readonly AutomationBlueprintStep<RecoveryCockpitPluginDescriptor<PluginId, AutomationStage>>[] => {
  const ranked = new Map(blueprint.steps.map((step) => [step.stepId, step.plugin.stage] as const));
  return [...blueprint.steps].sort((left, right) => {
    const leftRank = defaultStageOrder.indexOf(ranked.get(left.stepId) ?? left.plugin.stage);
    const rightRank = defaultStageOrder.indexOf(ranked.get(right.stepId) ?? right.plugin.stage);
    return leftRank - rightRank;
  });
};

export const bindDefaultTopology = (): TopologyDigest => {
  const discovered: AutomationBlueprint<RecoveryCockpitPluginDescriptor<PluginId, AutomationStage>> = buildDefaultBlueprint({
    pluginId: 'plugin:discover-default' as PluginId,
    stage: 'discover',
    pluginLabel: 'Discover bootstrap',
    route: 'discover:bootstrap',
    schemaVersion: 'v1' as any,
    supportedScopes: ['global'],
    requires: [],
    provides: ['compose'],
    inputExample: { seed: true },
    run: async () => ({
      state: 'succeeded',
      output: { discovered: 1 },
      metrics: { durationMs: 12 },
      warnings: [],
      errors: [],
    }),
  });
  const composed: AutomationBlueprint<RecoveryCockpitPluginDescriptor<PluginId, AutomationStage>> = buildDefaultBlueprint({
    pluginId: 'plugin:compose-default' as PluginId,
    stage: 'compose',
    pluginLabel: 'Compose bootstrap',
    route: 'compose:bootstrap',
    schemaVersion: 'v1' as any,
    supportedScopes: ['regional'],
    requires: ['discover'],
    provides: ['execute'],
    inputExample: { seed: true },
    run: async () => ({
      state: 'succeeded',
      output: { composed: 1 },
      metrics: { durationMs: 17 },
      warnings: [],
      errors: [],
    }),
  });
  const merged = buildNodesFromBlueprint({
    ...discovered,
    steps: [...discovered.steps, ...composed.steps],
  });
  return buildTopologyDigest(merged);
};

export const flattenNodeIds = (nodes: readonly FlowNode[]): readonly string[] => nodes.map((node) => node.nodeId);

export const mapNodesForPlugin = (nodes: readonly FlowNode[]): Readonly<Record<string, FlowNode>> =>
  nodes.reduce((acc, node) => ({
    ...acc,
    [node.pluginId]: node,
  }), {} as Record<string, FlowNode>);

export const mergeNodes = (...batches: readonly (readonly FlowNode[])[]): readonly FlowNode[] => {
  const out: FlowNode[] = [];
  const seen = new Set<string>();
  for (const batch of batches) {
    for (const node of batch) {
      if (!seen.has(node.nodeId)) {
        seen.add(node.nodeId);
        out.push(node);
      }
    }
  }
  return out;
};

export const resolveRouteFromStep = (
  step: AutomationBlueprintStep<RecoveryCockpitPluginDescriptor<PluginId, AutomationStage>>,
): string => `${step.plugin.stage}:${String(step.plugin.pluginId)}#${step.stepId}`;

const defaultStageOrder: AutomationStage[] = ['discover', 'compose', 'execute', 'verify', 'audit'];
