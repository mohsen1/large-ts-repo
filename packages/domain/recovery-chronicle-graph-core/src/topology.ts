import {
  asChronicleGraphEdgeId,
  asChronicleGraphNodeId,
  asChronicleGraphPhase,
  asChronicleGraphLane,
  sanitizeBlueprintNodes,
  type ChronicleGraphBlueprint,
  type ChronicleGraphEdge,
  type ChronicleGraphNode,
  type ChronicleGraphNodeId,
  type ChronicleGraphLane,
  type ChronicleGraphPhase,
} from './identity.js';

export type TopologyNodeOrder<TBlueprint extends ChronicleGraphBlueprint> = TBlueprint['nodes'][number]['id'][];

export type NodeAdjacency<TBlueprint extends ChronicleGraphBlueprint> = {
  [K in TBlueprint['nodes'][number]['id'] as `adj_${K & string}`]: readonly TBlueprint['edges'][number]['to'][];
};

export interface TopologyOptions {
  readonly allowCycles?: boolean;
  readonly maxFanOut?: number;
}

export interface TopologyNodeMetrics {
  readonly nodeId: ChronicleGraphNodeId;
  readonly inDegree: number;
  readonly outDegree: number;
}

export interface TopologyBuild {
  readonly ordered: TopologyNodeOrder<ChronicleGraphBlueprint>;
  readonly diagnostics: {
    readonly forkCount: number;
    readonly sinks: readonly ChronicleGraphNodeId[];
    readonly sources: readonly ChronicleGraphNodeId[];
  };
}

const buildEdgeMap = (blueprint: ChronicleGraphBlueprint): Map<ChronicleGraphNodeId, ChronicleGraphEdge[]> => {
  const map = new Map<ChronicleGraphNodeId, ChronicleGraphEdge[]>();
  for (const node of blueprint.nodes) {
    map.set(node.id, []);
  }
  for (const edge of blueprint.edges) {
    const bucket = map.get(edge.from) ?? [];
    bucket.push(edge);
    map.set(edge.from, bucket);
  }
  return map;
};

const computeDegrees = (blueprint: ChronicleGraphBlueprint): Map<ChronicleGraphNodeId, number> => {
  const degrees = new Map<ChronicleGraphNodeId, number>();
  for (const node of blueprint.nodes) {
    degrees.set(node.id, 0);
  }
  for (const edge of blueprint.edges) {
    degrees.set(edge.to, (degrees.get(edge.to) ?? 0) + 1);
  }
  return degrees;
};

const toEdge = (edge: ChronicleGraphEdge, index: number): ChronicleGraphEdge =>
  edge.id
    ? edge
    : {
        ...edge,
        id: asChronicleGraphEdgeId(`auto:${index}:${edge.from}:${edge.to}`) as ChronicleGraphEdge['id'],
      };

export const buildNodeTopology = (blueprint: ChronicleGraphBlueprint, options: TopologyOptions = {}): TopologyBuild => {
  const normalized = sanitizeBlueprintNodes(blueprint);
  const edgeMap = buildEdgeMap(normalized);
  const degrees = computeDegrees(normalized);
  const sortedEdges = normalized.edges.map(toEdge).toSorted((left, right) => left.weight - right.weight);
  const localDegrees = new Map(degrees);

  const sources = [...degrees.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([nodeId]) => nodeId)
    .toSorted((left, right) => String(left).localeCompare(String(right)));

  const sinks = [...edgeMap.entries()]
    .filter(([, outgoing]) => outgoing.length === 0)
    .map(([nodeId]) => nodeId)
    .toSorted((left, right) => String(left).localeCompare(String(right)));

  const ordered: ChronicleGraphNodeId[] = [];
  const queue = [...sources];

  for (let pointer = 0; pointer < queue.length; pointer += 1) {
    const nodeId = queue[pointer];
    ordered.push(nodeId);
    for (const edge of edgeMap.get(nodeId) ?? []) {
      const next = (localDegrees.get(edge.to) ?? 0) - 1;
      localDegrees.set(edge.to, next);
      if (next <= 0) queue.push(edge.to);
    }
  }

  if (!options.allowCycles && ordered.length < normalized.nodes.length) {
    throw new Error('topology cycle detected');
  }

  const maxFanOut = options.maxFanOut ?? 4;
  const forkCount = [...edgeMap.values()].filter((outgoing) => outgoing.length > maxFanOut).length;

  return {
    ordered: ordered as TopologyNodeOrder<ChronicleGraphBlueprint>,
    diagnostics: {
      forkCount,
      sinks,
      sources,
    },
  };
};

export const collectAdjacency = (blueprint: ChronicleGraphBlueprint): NodeAdjacency<ChronicleGraphBlueprint> => {
  const map = buildEdgeMap(blueprint);
  return Object.fromEntries(
    [...map.entries()].map(([nodeId, edges]) => [
      `adj_${nodeId}`,
      edges.map((edge) => edge.to),
    ]),
  ) as NodeAdjacency<ChronicleGraphBlueprint>;
};

export class ChronicleGraphTopology {
  readonly #blueprint: ChronicleGraphBlueprint;
  readonly #edgeMap: Map<ChronicleGraphNodeId, ChronicleGraphEdge[]>;
  readonly #inDegrees: Map<ChronicleGraphNodeId, number>;
  readonly #outDegrees: Map<ChronicleGraphNodeId, number>;
  readonly #sortedEdges: ChronicleGraphEdge[];

  public constructor(private readonly input: ChronicleGraphBlueprint) {
    this.#blueprint = sanitizeBlueprintNodes(input);
    this.#edgeMap = buildEdgeMap(this.#blueprint);
    this.#inDegrees = computeDegrees(this.#blueprint);
    this.#outDegrees = new Map(Array.from(this.#edgeMap.entries()).map(([nodeId, outgoing]) => [nodeId, outgoing.length]));
    this.#sortedEdges = [...this.#blueprint.edges].toSorted((left, right) => left.weight - right.weight);
  }

  public orderedNodes(): readonly ChronicleGraphNodeId[] {
    return buildNodeTopology(this.#blueprint).ordered;
  }

  public nodeMap(): Record<string, ChronicleGraphNode> {
    return this.#blueprint.nodes.reduce<Record<string, ChronicleGraphNode>>((acc, node) => {
      acc[node.id] = node;
      return acc;
    }, {});
  }

  public metrics(): readonly TopologyNodeMetrics[] {
    return this.#blueprint.nodes.map((node) => ({
      nodeId: node.id,
      inDegree: this.#inDegrees.get(node.id) ?? 0,
      outDegree: this.#outDegrees.get(node.id) ?? 0,
    }));
  }

  public paths(maxLength = 6): readonly ChronicleGraphNodeId[][] {
    const starts = this.#blueprint.nodes
      .filter((node) => (this.#inDegrees.get(node.id) ?? 0) === 0)
      .map((node) => node.id);

    const output: ChronicleGraphNodeId[][] = [];

    const walk = (nodeId: ChronicleGraphNodeId, trail: ChronicleGraphNodeId[]) => {
      const edges = this.#edgeMap.get(nodeId) ?? [];
      if (edges.length === 0 || trail.length >= maxLength) {
        output.push(trail);
        return;
      }
      for (const edge of edges) {
        walk(edge.to, [...trail, edge.to]);
      }
    };

    for (const start of starts) {
      walk(start, [start]);
    }

    return output;
  }

  public hasCycle(): boolean {
    return this.orderedNodes().length < this.#blueprint.nodes.length;
  }

  public renderLanes(): readonly ChronicleGraphLane[] {
    const lanes = new Set<ChronicleGraphLane>(this.#blueprint.nodes.map((node) => node.lane));
    return [...lanes].toSorted((left, right) => String(left).localeCompare(String(right)));
  }

  public toReport(): {
    readonly hasCycle: boolean;
    readonly forkCount: number;
    readonly sourceCount: number;
    readonly sinkCount: number;
  } {
    const topology = buildNodeTopology(this.#blueprint, { maxFanOut: 4, allowCycles: true });
    return {
      hasCycle: this.hasCycle(),
      forkCount: topology.diagnostics.forkCount,
      sourceCount: topology.diagnostics.sources.length,
      sinkCount: topology.diagnostics.sinks.length,
    };
  }

  public selectPhasePalette(): readonly ChronicleGraphPhase[] {
    return this.renderLanes().map((lane) => asChronicleGraphPhase(String(lane).replace('lane:', '')) as ChronicleGraphPhase);
  }

  public edgeChain(): readonly ChronicleGraphEdge[] {
    return this.#sortedEdges;
  }

  public summaryTimeline(): readonly [ChronicleGraphNodeId, ChronicleGraphLane, ChronicleGraphNodeId][] {
    return this.#sortedEdges.map((edge) => [edge.from, asChronicleGraphLane('control'), edge.to]);
  }

  public bootstrapNode(): ChronicleGraphNode {
    return (
      this.#blueprint.nodes.at(0) ?? {
        id: asChronicleGraphNodeId('bootstrap'),
        name: 'bootstrap',
        lane: asChronicleGraphLane('control'),
        dependsOn: [],
        labels: { inferred: true },
      }
    );
  }
}
