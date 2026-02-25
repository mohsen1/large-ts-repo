import {
  asChronicleRunId,
  asChronicleRoute,
  asTimelineNodeId,
  asStatus,
  phaseWeights,
  type ChroniclePhase,
  type ChronicleRoute,
  type ChronicleStatus,
  type ChronicleTopologyEdge,
  type ChronicleTopologyGraph,
  type ChronicleTopologyNode,
} from './tokens.js';
import type { NoInfer } from '@shared/type-level';

export interface StageDescriptor {
  readonly phase: ChroniclePhase;
  readonly weight?: number;
}

export interface TopologyEnvelope {
  readonly route: ChronicleRoute;
  readonly phase: ChroniclePhase;
  readonly status: ChronicleStatus;
  readonly startedAt: number;
}

export type StagePath<T extends readonly StageDescriptor[]> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends StageDescriptor
    ? [Head, ...RecursiveStage<Tail & readonly StageDescriptor[]>]
    : []
  : [];

export type RecursiveStage<T extends readonly StageDescriptor[]> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends StageDescriptor
    ? readonly [Head, ...RecursiveStage<Tail extends readonly StageDescriptor[] ? Tail : []>]
    : []
  : [];

export const normalizePhases = (phases: readonly ChroniclePhase[]): readonly ChroniclePhase[] => {
  const seen = new Set<string>();
  const normalized = phases.map((phase) => phase);
  const ordered = [...new Set(normalized)].sort();
  return ordered.filter((phase) => {
    if (seen.has(phase)) return false;
    seen.add(phase);
    return true;
  });
};

export const buildNodes = (route: ChronicleRoute, phases: readonly ChroniclePhase[]): readonly ChronicleTopologyNode[] =>
  normalizePhases(phases).map((phase, index) => ({
    id: asTimelineNodeId(route, phase, index),
    label: `${route} ${phase}`,
    phase,
    scope: `scope:${index}`,
  }));

export const buildEdges = (nodes: readonly ChronicleTopologyNode[]): readonly ChronicleTopologyEdge[] => {
  const edges: ChronicleTopologyEdge[] = [];
  for (const [index, current] of nodes.slice(0, -1).entries()) {
    const next = nodes[index + 1];
    if (!next) continue;
    edges.push({
      from: current.id,
      to: next.id,
      delayMs: 20 + next.phase.length * 4,
    });
  }
  return edges;
};

export const buildTopology = (route: ChronicleRoute, descriptors: readonly StageDescriptor[]): ChronicleTopologyGraph => {
  const phases = descriptors.map((descriptor) => descriptor.phase);
  const nodes = buildNodes(route, phases);
  const edges = buildEdges(nodes);
  return {
    route,
    nodes,
    edges,
  };
};

export const buildTimeline = (route: ChronicleRoute, descriptors: readonly StageDescriptor[]): ChronicleTopologyGraph =>
  buildTopology(route, descriptors);

export const toTopologyMap = (graph: ChronicleTopologyGraph): ReadonlyMap<ChroniclePhase, ChronicleTopologyNode> => {
  return new Map(graph.nodes.map((node) => [node.phase, node] satisfies [ChroniclePhase, ChronicleTopologyNode]));
};

export const phaseWeightsSnapshot = (phases: readonly StageDescriptor[]): Readonly<Record<ChroniclePhase, number>> => {
  const summary = {
    'phase:boot': 0,
    'phase:signal': 0,
    'phase:policy': 0,
    'phase:verify': 0,
    'phase:finalize': 0,
  } as const satisfies Record<ChroniclePhase, number>;

  return phases.reduce((acc, phase) => {
    const normalized = phase.phase;
    acc[normalized] += (phase.weight ?? phaseWeights[normalized.replace('phase:', '') as keyof typeof phaseWeights]) ?? 0;
    return acc;
  }, { ...summary });
};

export const foldTopologyScore = (graph: ChronicleTopologyGraph): number => {
  return graph.nodes.reduce((sum, node, index) => sum + phaseWeights[node.phase.replace('phase:', '') as keyof typeof phaseWeights] + index, 0);
};

export const topologyLines = (graph: ChronicleTopologyGraph): readonly string[] =>
  graph.nodes.toSorted((left, right) => left.phase.localeCompare(right.phase)).map((node) => `${node.id}:${node.phase}:${node.label}`);

export const summarizeTopology = (graph: ChronicleTopologyGraph): readonly string[] => [
  `route=${graph.route}`,
  `nodes=${graph.nodes.length}`,
  `edges=${graph.edges.length}`,
  `score=${foldTopologyScore(graph)}`,
];

export const toTimelineLine = (graph: ChronicleTopologyGraph): readonly string[] =>
  graph.nodes.map((node, index) => {
    const score = foldTopologyScore(graph);
    return `${String(node.phase)}#${index + 1}: route=${graph.route} score=${score}`;
  });

export async function* topologyRunEnvelope(
  graph: ChronicleTopologyGraph,
  runId: NoInfer<ReturnType<typeof asChronicleRunId>>,
): AsyncGenerator<TopologyEnvelope> {
  let index = 0;
  for (const node of graph.nodes) {
    const status = index === graph.nodes.length - 1 ? 'succeeded' : 'running';
    await Promise.resolve();
    yield {
      route: asChronicleRoute(graph.route),
      phase: node.phase,
      status: asStatus(status),
      startedAt: Date.now() + index,
    };
    index += 1;
  }
}
