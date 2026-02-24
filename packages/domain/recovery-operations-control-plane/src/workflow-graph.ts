import { withBrand } from '@shared/core';
import type { RecoveryStep } from '@domain/recovery-orchestration';
import type { RunPlanId } from '@domain/recovery-operations-models';
import type { ControlPlaneConstraint, ControlPlaneGraph, Stage } from './types';

export interface StageNode {
  readonly id: string;
  readonly inbound: readonly string[];
  readonly outbound: readonly string[];
  readonly role: 'root' | 'leaf' | 'middle';
}

export interface BuildGraphInput {
  readonly runId: RunPlanId;
  readonly steps: readonly RecoveryStep[];
}

export interface GraphSnapshot {
  readonly graph: ControlPlaneGraph;
  readonly nodes: readonly StageNode[];
  readonly constraints: readonly ControlPlaneConstraint[];
}

const buildEdges = (steps: readonly RecoveryStep[]) =>
  steps.flatMap((step) =>
    step.dependencies.map((dependency) => ({
      from: dependency,
      to: step.id,
      weight: 1,
    })),
  );

const computeDepth = (edges: readonly { from: string; to: string; weight: number }[], nodes: readonly string[]) => {
  const level = new Map<string, number>();
  for (const node of nodes) {
    level.set(node, 0);
  }

  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
  }

  for (const _ of nodes) {
    for (const [from, tos] of outgoing) {
      for (const to of tos) {
        const next = (level.get(to) ?? 0) + 1;
        level.set(to, Math.max(level.get(to) ?? 0, next));
      }
    }
  }

  return level;
};

const stageFor = (inbound: readonly string[], outbound: readonly string[]): StageNode['role'] => {
  if (inbound.length === 0) return 'root';
  if (outbound.length === 0) return 'leaf';
  return 'middle';
};

export const buildWorkflowGraph = (input: BuildGraphInput): GraphSnapshot => {
  const nodes = input.steps.map((step) => step.id);
  const edges = buildEdges(input.steps);

  const inbound = new Map<string, string[]>();
  const outbound = new Map<string, string[]>();

  for (const edge of edges) {
    inbound.set(edge.to, [...(inbound.get(edge.to) ?? []), edge.from]);
    outbound.set(edge.from, [...(outbound.get(edge.from) ?? []), edge.to]);
  }

  const depth = computeDepth(edges, nodes);

  const graphNodes = nodes.map((node) => {
    const inboundNodes = inbound.get(node) ?? [];
    const outboundNodes = outbound.get(node) ?? [];
    return {
      id: node,
      inbound: inboundNodes,
      outbound: outboundNodes,
      role: stageFor(inboundNodes, outboundNodes),
    } satisfies StageNode;
  });

  const constraints: ControlPlaneConstraint[] = [
    {
      name: 'node-depth',
      kind: 'monitor',
      limit: Math.max(1, input.steps.length),
      warningThreshold: Math.max(8, input.steps.length - 1),
    },
  ];

  const graph: ControlPlaneGraph = {
    runId: withBrand(String(input.runId), 'ControlPlaneRunId'),
    nodes,
    edges: edges.map((edge) => ({
      from: edge.from,
      to: edge.to,
      weight: edge.weight,
    })),
    rootNodes: graphNodes.filter((node) => node.role === 'root').map((node) => node.id),
    terminalNodes: graphNodes.filter((node) => node.role === 'leaf').map((node) => node.id),
  };

  for (const node of graphNodes) {
    const level = depth.get(node.id) ?? 0;
    constraints.push({
      name: `depth-${node.id}`,
      kind: level > 2 ? 'strict' : 'monitor',
      limit: Math.max(1, node.outbound.length + level),
      warningThreshold: Math.max(1, node.inbound.length + 1),
    });
  }

  return {
    graph,
    nodes: graphNodes,
    constraints,
  };
};

export const stageSummary = (snapshot: GraphSnapshot): string =>
  `${snapshot.nodes.length} nodes, ${snapshot.graph.edges.length} edges`;

export const buildLayers = (snapshot: GraphSnapshot): readonly string[][] => {
  const buckets = new Map<number, string[]>();

  for (const node of snapshot.nodes) {
    const level = Math.min(8, node.inbound.length + (node.outbound.length > 0 ? 0 : 1));
    const current = buckets.get(level) ?? [];
    current.push(node.id);
    buckets.set(level, current);
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map((entry) => [...entry[1]]);
};

export const graphHasCycles = (graph: ControlPlaneGraph): boolean => {
  const visited = new Set<string>();
  const stack = new Set<string>();
  const out = new Map<string, string[]>();

  for (const edge of graph.edges) {
    const from = String(edge.from);
    const to = String(edge.to);
    out.set(from, [...(out.get(from) ?? []), to]);
  }

  const visit = (node: string): boolean => {
    if (stack.has(node)) return true;
    if (visited.has(node)) return false;
    visited.add(node);
    stack.add(node);

    for (const next of out.get(node) ?? []) {
      if (visit(next)) return true;
    }

    stack.delete(node);
    return false;
  };

  for (const node of graph.nodes as readonly string[]) {
    if (visit(node)) return true;
  }

  return false;
};

const withWeight = (node: StageNode): number => node.inbound.length + node.outbound.length;

export const summarizeGraph = (snapshot: GraphSnapshot): ReadonlyArray<{
  readonly id: string;
  readonly role: StageNode['role'];
  readonly degree: number;
  readonly isCritical: boolean;
  readonly stage: Stage;
}> =>
  snapshot.nodes.map((node) => ({
    id: node.id,
    role: node.role,
    degree: withWeight(node),
    isCritical: node.inbound.length > 4 || node.outbound.length > 4,
    stage: withWeight(node) > 3 ? 'verify' : 'execute',
  }));
