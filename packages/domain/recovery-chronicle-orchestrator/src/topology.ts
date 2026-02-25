import {
  asChronicleStepId,
  asChronicleTag,
  type ChronicleBlueprint,
  type ChronicleEdge,
  type ChronicleNode,
} from '@domain/recovery-chronicle-core';
import type { OrchestratedRun } from './types';

export interface RuntimeTopology {
  readonly planId: string;
  readonly nodes: readonly ChronicleNode[];
  readonly edges: readonly ChronicleEdge[];
}

export type TopologyTuple<T extends readonly ChronicleNode[]> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends ChronicleNode
    ? readonly [Head['id'], ...TopologyTuple<Extract<Tail, readonly ChronicleNode[]>>]
    : readonly []
  : readonly [];

export const mapStagesToNodes = (planId: string, labels: readonly string[]): readonly ChronicleNode[] =>
  labels.map((label, index) => ({
    id: asChronicleStepId(`${planId}:${label}:${index}`),
    label,
    lane: index % 2 === 0 ? 'control' : 'signal',
    dependencies: index === 0 ? [] : [asChronicleStepId(`${planId}:${labels[index - 1]}:${index - 1}`)],
  }));

export const makeEdges = (nodes: readonly ChronicleNode[]): readonly ChronicleEdge[] => {
  const edges: ChronicleEdge[] = [];
  for (let index = 1; index < nodes.length; index += 1) {
    const previous = nodes[index - 1];
    const current = nodes[index];
    if (!previous || !current) continue;
    edges.push({ from: previous.id, to: current.id, weight: 1 + index * 0.25 });
  }
  return edges;
};

export const buildTopology = (planId: string, labels: readonly string[]): RuntimeTopology => {
  const nodes = mapStagesToNodes(planId, labels).toSorted((left, right) => left.label.localeCompare(right.label));
  const edges = makeEdges(nodes);
  return { planId, nodes, edges };
};

export const blueprintFromRun = (run: OrchestratedRun): ChronicleBlueprint => {
  const labels = run.output.map((entry, index) => `${entry.stage}:${index}:${entry.status}`);
  const phases = mapStagesToNodes(run.runId, labels);
  return {
    name: `blueprint:${run.runId}`,
    description: `run ${run.runId}`,
    tenant: run.context.tenant,
    route: run.scenario.route,
    tags: [asChronicleTag('run'), asChronicleTag(run.scenario.id)],
    plan: run.scenario.id,
    phases,
    edges: makeEdges(phases),
  };
};

export function* topologyNodes<TTopology extends readonly ChronicleNode[]>(nodes: TTopology) {
  for (const node of nodes) {
    yield node;
  }
}

export const flattenTopology = (nodes: readonly ChronicleNode[]): readonly string[] =>
  [...topologyNodes(nodes)].map((node) => node.id);
