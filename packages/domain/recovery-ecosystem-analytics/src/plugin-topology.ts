import { mapTupleRecursively, mapWithIteratorHelpers, type JsonValue, type NoInfer } from '@shared/type-level';
import {
  asNamespace,
  asRun,
  asSession,
  asTenant,
  asWindow,
  type AnalyticsWindow,
  type AnalyticsTenant,
  type SignalNamespace,
} from './identifiers';
import {
  pluginKindFromSignal,
  toPluginTraceId,
  type PluginNode,
  type PluginRoute,
  type PluginRouteSignature,
  type PluginRunContext,
} from './typed-plugin-types';

export type TopologyNode = `node:${string}`;
export type TopologyEdge = readonly [TopologyNode, TopologyNode];
export type TopologyMatrix = readonly TopologyEdge[];

export interface TopologyPlanOptions {
  readonly maxDepth: number;
  readonly allowCycles: boolean;
  readonly includeDetached: boolean;
}

export interface TopologyNodeDescriptor<TPlugin extends PluginNode = PluginNode> {
  readonly id: TopologyNode;
  readonly plugin: TPlugin;
  readonly dependencies: readonly TopologyNode[];
  readonly dependents: readonly TopologyNode[];
}

export interface TopologyTraversal<TPlugin extends PluginNode = PluginNode> {
  readonly ordered: readonly TopologyNodeDescriptor<TPlugin>[];
  readonly matrix: TopologyMatrix;
  readonly paths: readonly TopologyNode[][];
}

const defaultTopologyOptions: TopologyPlanOptions = {
  maxDepth: 12,
  allowCycles: false,
  includeDetached: true,
};

const asTopologyNode = (value: string): TopologyNode => (`node:${value.replace(/^plugin:/, '')}` as TopologyNode);

export class PluginTopologyGraph<TPlugins extends readonly PluginNode[]> {
  #nodes = new Map<TopologyNode, TopologyNodeDescriptor<PluginNode>>();
  #edges = new Map<TopologyNode, Set<TopologyNode>>();
  #options: TopologyPlanOptions;
  #tenant: AnalyticsTenant;
  #namespace: SignalNamespace;
  #window: AnalyticsWindow;
  #stack = new AsyncDisposableStack();

  constructor(plugins: NoInfer<TPlugins>, options: Partial<TopologyPlanOptions> = {}) {
    this.#tenant = asTenant('tenant:recovery-ecosystem');
    this.#namespace = asNamespace('recovery-ecosystem-topology');
    this.#window = asWindow(`topology-${Date.now()}`);
    this.#options = {
      ...defaultTopologyOptions,
      ...options,
    };

    for (const plugin of plugins) {
      const nodeId = asTopologyNode(plugin.name);
      const descriptor: TopologyNodeDescriptor<PluginNode> = {
        id: nodeId,
        plugin,
        dependencies: mapWithIteratorHelpers(plugin.dependsOn, (entry) => asTopologyNode(String(entry).replace('plugin:', ''))),
        dependents: [],
      };
      this.#nodes.set(nodeId, descriptor);
      this.#edges.set(nodeId, new Set(descriptor.dependencies));
    }

    for (const entry of this.#nodes.values()) {
      for (const dependency of entry.dependencies) {
        const target = this.#nodes.get(dependency);
        if (!target) {
          continue;
        }
        this.#nodes.set(
          dependency,
          {
            ...target,
            dependents: [...target.dependents, entry.id],
          } as TopologyNodeDescriptor<PluginNode>,
        );
      }
    }
  }

  get runWindow(): AnalyticsWindow {
    return this.#window;
  }

  get tenant(): AnalyticsTenant {
    return this.#tenant;
  }

  get namespace(): SignalNamespace {
    return this.#namespace;
  }

  get nodes(): readonly TopologyNode[] {
    return [...this.#nodes.keys()];
  }

  get size(): number {
    return this.#nodes.size;
  }

  has(node: TopologyNode): boolean {
    return this.#nodes.has(node);
  }

  getPath(node: TopologyNode): readonly TopologyNode[] {
    const queue: TopologyNode[] = [node];
    const path: TopologyNode[] = [];
    const seen = new Set<TopologyNode>([node]);

    while (queue.length > 0 && path.length < this.#options.maxDepth) {
      const current = queue.shift();
      if (!current) {
        continue;
      }
      const descriptor = this.#nodes.get(current);
      if (!descriptor) {
        continue;
      }
      path.push(current);
      for (const dependency of descriptor.dependencies) {
        if (!this.#options.allowCycles && seen.has(dependency)) {
          continue;
        }
        seen.add(dependency);
        queue.push(dependency);
      }
    }

    return path;
  }

  route<T extends readonly PluginNode[]>(node: TopologyNode): PluginRoute<T> {
    return this.getPath(node) as PluginRoute<T>;
  }

  isAcyclic(): boolean {
    const visiting = new Set<TopologyNode>();
    const visited = new Set<TopologyNode>();

    const visit = (node: TopologyNode): boolean => {
      if (visited.has(node)) {
        return true;
      }
      if (visiting.has(node)) {
        return false;
      }
      visiting.add(node);
      for (const dependency of this.#edges.get(node) ?? []) {
        if (!visit(dependency)) {
          return false;
        }
      }
      visiting.delete(node);
      visited.add(node);
      return true;
    };

    return [...this.#nodes.keys()].every((node) => visit(node));
  }

  order(): TopologyTraversal<PluginNode> {
    const matrix: TopologyEdge[] = [];
    const indegree = new Map<TopologyNode, number>(this.nodes.map((node) => [node, 0]));
    for (const dependencies of this.#edges.values()) {
      for (const dependency of dependencies) {
        indegree.set(dependency, (indegree.get(dependency) ?? 0) + 1);
      }
    }

    const queue: TopologyNode[] = this.nodes.filter((node) => (indegree.get(node) ?? 0) === 0);
    const ordered: TopologyNode[] = [];
    for (let index = 0; index < queue.length; index += 1) {
      const node = queue[index];
      ordered.push(node);
      for (const dependent of this.#nodes.get(node)?.dependents ?? []) {
        const next = (indegree.get(dependent) ?? 0) - 1;
        indegree.set(dependent, next);
        matrix.push([node, dependent]);
        if (next === 0) {
          queue.push(dependent);
        }
      }
    }

    if (this.#options.includeDetached) {
      for (const node of this.nodes) {
        if (!ordered.includes(node)) {
          ordered.push(node);
        }
      }
    }

    return {
      ordered: ordered
        .map((node) => this.#nodes.get(node))
        .filter((entry): entry is TopologyNodeDescriptor<PluginNode> => entry !== undefined),
      matrix: matrix as TopologyMatrix,
      paths: ordered.map((entry) => [entry]),
    };
  }

  snapshot(): Readonly<Record<string, { readonly plugin: PluginNode; readonly active: boolean }>> {
    const snapshot: Record<string, { readonly plugin: PluginNode; readonly active: boolean }> = {};
    for (const [node, entry] of this.#nodes) {
      snapshot[node] = {
        plugin: entry.plugin,
        active: true,
      };
    }
    return snapshot;
  }

  createRunContext(seed = `run:${Date.now()}`): PluginRunContext {
    return {
      tenant: this.#tenant,
      namespace: this.#namespace,
      window: this.#window,
      runId: asRun(seed),
      trace: toPluginTraceId(seed),
    };
  }

  mapTopology<R>(mapper: (entry: TopologyNodeDescriptor<PluginNode>, index: number) => R): readonly R[] {
    const values = [...this.#nodes.values()];
    return values.map((entry, index) => mapper(entry, index));
  }

  async summarize(): Promise<{
    readonly acyclic: boolean;
    readonly size: number;
    readonly trace: readonly JsonValue[];
  }> {
    return {
      acyclic: this.isAcyclic(),
      size: this.size,
      trace: this.mapTopology((entry, index) => ({
        id: entry.plugin.name,
        index,
      })),
    };
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.#nodes.clear();
    this.#edges.clear();
    await this.#stack.disposeAsync();
  }

  [Symbol.dispose](): void {
    this.#nodes.clear();
    this.#edges.clear();
  }
}

export type RawTopologyNodeInput = {
  readonly plugins: readonly PluginNode[];
  readonly options?: Partial<TopologyPlanOptions>;
};

export const buildTopologyFromPlugins = <TPlugins extends readonly PluginNode[]>(
  plugins: NoInfer<TPlugins>,
  options: Partial<TopologyPlanOptions> = {},
): PluginTopologyGraph<TPlugins> => {
  return new PluginTopologyGraph(plugins, options);
};

export const normalizeTopologyNodes = (inputs: readonly PluginNode[]): readonly PluginNode[] =>
  mapWithIteratorHelpers(inputs, (entry) => entry);

export const topologyFingerprint = <TPlugins extends readonly PluginNode[]>(plugins: TPlugins): PluginRouteSignature<TPlugins> => {
  const route = mapWithIteratorHelpers(plugins, (entry) => entry.name.replace('plugin:', ''));
  const value = `route:${route.join('::')}` as PluginRouteSignature<TPlugins>;
  return value;
};

export const normalizeTopologyPluginKinds = (plugins: readonly PluginNode[]): readonly PluginNode['kind'][] =>
  mapWithIteratorHelpers(plugins, (plugin) => pluginKindFromSignal(plugin.kind as unknown as string));

export const resolveTopologyScope = (options: RawTopologyNodeInput): {
  readonly scope: `scope:${string}`;
  readonly count: number;
} => ({
  scope: `scope:${options.plugins.length}-${options.options?.maxDepth ?? defaultTopologyOptions.maxDepth}`,
  count: options.plugins.length,
});

export const createTopologyTrace = (
  plugins: readonly PluginNode[],
  namespace = 'namespace:recovery-ecosystem',
): string => {
  return `${namespace}::${plugins.length}::${plugins.map((plugin) => plugin.signature).join('|')}`;
};

export const topologyToRunWindow = (seed: string): ReturnType<typeof asWindow> => asWindow(`window:${seed}`);
export const topologyToSession = (seed: string): ReturnType<typeof asSession> => asSession(`session:${seed}`);
export const topologySeedFor = (tenant: string): string => asRun(`topology:${tenant}`).replace('run:', 'seed:');
