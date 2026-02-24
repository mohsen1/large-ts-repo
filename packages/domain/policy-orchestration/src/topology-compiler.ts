import { NodeId } from '@shared/core';
import { PolicyNode, OrchestrationNodeId, PolicyWave, PolicyGraph } from './models';

export interface TopologyBuildOptions {
  readonly ignoreOrphans?: boolean;
  readonly sortByDependencyDepth?: boolean;
  readonly includeStages?: readonly number[];
}

export interface TopologyNodeRecord {
  readonly id: OrchestrationNodeId;
  readonly title: string;
  readonly level: number;
  readonly dependencies: number;
}

export interface TopologyBuildResult {
  readonly waves: readonly PolicyWave[];
  readonly orphanCount: number;
  readonly levels: readonly TopologyNodeRecord[];
}

type IteratorChain<T> = IterableIterator<T> & {
  map<U>(transform: (item: T) => U): IterableChain<U>;
  filter(predicate: (item: T) => boolean): IterableChain<T>;
  toArray(): T[];
};

type IterableChain<T> = { [K in keyof IteratorChain<T>]: IteratorChain<T>[K] };
type TopologyPath = `graph:${string}`;

const iteratorFromIterable = <T>(values: Iterable<T>): IterableChain<T> | null => {
  const creator = (globalThis as { Iterator?: { from?: <V>(value: Iterable<V>) => IteratorChain<V> } }).Iterator?.from;
  if (!creator) return null;
  return creator(values);
};

export const computeNodeLevels = (nodes: readonly PolicyNode[]): readonly TopologyNodeRecord[] => {
  const map = new Map<OrchestrationNodeId, TopologyNodeRecord>();
  for (const node of nodes) {
    map.set(node.id, {
      id: node.id,
      title: node.artifact.name,
      level: node.dependsOn.length,
      dependencies: node.dependsOn.length,
    });
  }

  const sorted = iteratorFromIterable(map.values())?.toArray() ?? [...map.values()];
  return sorted.toSorted((left, right) => left.level - right.level || right.dependencies - left.dependencies);
}

const walkDependencyLevels = (nodes: readonly PolicyNode[]): readonly OrchestrationNodeId[][] => {
  const levels: OrchestrationNodeId[][] = [];
  const prepared = new Map<OrchestrationNodeId, { node: PolicyNode; remaining: number; dependents: Set<OrchestrationNodeId> }>();

  for (const node of nodes) {
    prepared.set(node.id, {
      node,
      remaining: node.dependsOn.length,
      dependents: new Set<OrchestrationNodeId>(),
    });
  }

  for (const node of nodes) {
    for (const dependency of node.dependsOn) {
      const source = prepared.get(dependency);
      if (source) source.dependents.add(node.id);
    }
  }

  const queue = iteratorFromIterable(
    [...prepared.values()].filter((entry) => entry.remaining === 0).map((entry) => entry.node.id),
  )?.toArray() ?? nodes.filter((node) => node.dependsOn.length === 0).map((node) => node.id);

  while (queue.length > 0) {
    const level: OrchestrationNodeId[] = [...queue];
    queue.length = 0;
    levels.push(level);

    for (const nodeId of level) {
      const entry = prepared.get(nodeId);
      if (!entry) continue;
      for (const dependentId of entry.dependents) {
        const dependent = prepared.get(dependentId);
        if (!dependent) continue;
        dependent.remaining -= 1;
        if (dependent.remaining === 0) queue.push(dependentId);
      }
    }
  }

  return levels;
};

export const buildTopologyFromNodes = (nodes: readonly PolicyNode[]): TopologyBuildResult => {
  const sortedLevels = walkDependencyLevels(nodes);
  const waves: PolicyWave[] = sortedLevels.map((waveNodes, index) => ({
    wave: index,
    nodes: nodes.filter((node) => waveNodes.includes(node.id)),
    edges: nodeEdges(nodes),
  }));
  const levels = computeNodeLevels(nodes);
  const knownNodes = new Set(nodes.map((node) => node.id));
  const orphans = nodes.filter((node) => node.dependsOn.every((dependency) => !knownNodes.has(dependency))).length;
  return {
    waves,
    orphanCount: orphans,
    levels,
  };
};

const nodeEdges = (nodes: readonly PolicyNode[]): PolicyWave['edges'] => {
  const edgeMap = new Map<string, PolicyWave['edges'][number]>();
  for (const node of nodes) {
    for (const from of node.dependsOn) {
      const key = `${from}->${node.id}`;
      const weight = Math.max(1, node.timeoutSeconds);
      edgeMap.set(key, {
        from: (from as unknown) as NodeId,
        to: (node.id as unknown) as NodeId,
        weight,
      });
    }
  }

  return [...edgeMap.values()];
};

export const buildGraphArtifactPath = (id: OrchestrationNodeId, level: number): TopologyPath =>
  `graph:${String(level)}/${String(id)}` as TopologyPath;

export const summarizeGraph = (graph: PolicyGraph): string => {
  const records = computeNodeLevels(graph.nodes);
  const parts = records.map((record) => `${record.title}=${record.level}:${record.dependencies}`);
  return `${records.length} nodes (${parts.join(', ')})`;
};

export class TopologyCompiler implements AsyncDisposable {
  readonly #nodes: PolicyNode[] = [];
  readonly #options: TopologyBuildOptions;
  #closed = false;

  public constructor(nodes: readonly PolicyNode[] = [], options: TopologyBuildOptions = {}) {
    this.#nodes = [...nodes];
    this.#options = options;
  }

  public static fromGraph(graph: PolicyGraph, options: TopologyBuildOptions = {}): TopologyCompiler {
    return new TopologyCompiler(graph.nodes, options);
  }

  public get options(): TopologyBuildOptions {
    return this.#options;
  }

  public add(node: PolicyNode): void {
    this.#nodes.push(node);
  }

  public replace(nodes: readonly PolicyNode[]): void {
    this.#nodes.length = 0;
    this.#nodes.push(...nodes);
  }

  public compile(): TopologyBuildResult {
    const normalized = this.#nodes
      .map((node) => ({
        ...node,
        artifact: {
          ...node.artifact,
          target: {
            ...node.artifact.target,
            region: node.artifact.target.region.toLowerCase(),
          },
        },
      }));
    return buildTopologyFromNodes(normalized);
  }

  public [Symbol.asyncDispose](): Promise<void> {
    if (this.#closed) return Promise.resolve();
    this.#closed = true;
    this.#nodes.length = 0;
    return Promise.resolve();
  }
}
