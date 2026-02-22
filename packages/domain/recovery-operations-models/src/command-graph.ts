import type { Brand } from '@shared/core';
import { withBrand } from '@shared/core';
import type { CommandIntentSlot } from './command-intent';
import type { RecoveryProgram, RecoveryStep } from '@domain/recovery-orchestration';
import type { PolicyDecision } from './policy-gates';

export type GraphNodeId = Brand<string, 'RecoveryCommandNode'>;
export type EdgeWeight = number;

export interface CommandGraphNode {
  readonly id: GraphNodeId;
  readonly intentId: CommandIntentSlot['intentId'];
  readonly stepId: RecoveryStep['id'];
  readonly weight: EdgeWeight;
  readonly decision: PolicyDecision;
}

export interface CommandGraphEdge {
  readonly from: GraphNodeId;
  readonly to: GraphNodeId;
  readonly weight: EdgeWeight;
}

export interface CommandGraph {
  readonly tenant: string;
  readonly planId: string;
  readonly nodes: readonly CommandGraphNode[];
  readonly edges: readonly CommandGraphEdge[];
  readonly criticalPathWeight: number;
  readonly generatedAt: string;
}

export interface CommandGraphPlan {
  readonly tenant: string;
  readonly runId: string;
  readonly graph: CommandGraph;
  readonly estimatedDurationMs: number;
  readonly recommendedSequence: readonly GraphNodeId[];
}

const nodeId = (tenant: string, step: RecoveryStep): GraphNodeId =>
  withBrand(`${tenant}:${step.id}:${step.tags[0] ?? 'default'}`, 'RecoveryCommandNode');

const weightFor = (step: RecoveryStep): EdgeWeight => {
  const timeout = Number.isFinite(step.timeoutMs) ? step.timeoutMs : 0;
  const approvals = Number.isFinite(step.requiredApprovals) ? step.requiredApprovals : 0;
  return Math.max(0, timeout * (1 + approvals / 2));
};

const buildNodes = (tenant: string, program: RecoveryProgram, intents: readonly CommandIntentSlot[]): readonly CommandGraphNode[] =>
  program.steps.map((step) => {
    const selected = intents.find((intent) => intent.signalIds[0] === step.id);
    return {
      id: nodeId(tenant, step),
      intentId: selected?.intentId ?? (withBrand(`${tenant}:${step.id}:implicit`, 'CommandIntentId') as CommandIntentSlot['intentId']),
      stepId: step.id,
      weight: weightFor(step),
      decision: selected?.urgency === 'critical' ? 'allow' : 'warn',
    };
  });

const buildEdges = (nodes: readonly CommandGraphNode[], program: RecoveryProgram): readonly CommandGraphEdge[] => {
  const byStep = new Map<string, CommandGraphNode>();
  for (const node of nodes) {
    byStep.set(String(node.stepId), node);
  }

  const edges: CommandGraphEdge[] = [];
  for (const step of program.steps) {
    const from = byStep.get(String(step.id));
    if (!from) continue;

    for (const dependency of step.dependencies) {
      const to = byStep.get(dependency);
      if (!to) {
        continue;
      }
      edges.push({ from: to.id, to: from.id, weight: 1 + to.weight / Math.max(1, from.weight) });
    }
  }

  return edges;
};

const topoSort = (nodes: readonly CommandGraphNode[], edges: readonly CommandGraphEdge[]): readonly GraphNodeId[] => {
  const inDegree = new Map<GraphNodeId, number>();
  for (const node of nodes) {
    inDegree.set(node.id, 0);
  }

  for (const edge of edges) {
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  const queue: GraphNodeId[] = [...inDegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([node]) => node);

  const ordered: GraphNodeId[] = [];
  const incoming = new Map<GraphNodeId, GraphNodeId[]>();
  for (const edge of edges) {
    const targets = incoming.get(edge.from) ?? [];
    targets.push(edge.to);
    incoming.set(edge.from, targets);
  }

  while (queue.length) {
    const current = queue.shift();
    if (!current) break;
    ordered.push(current);

    const targets = incoming.get(current) ?? [];
    for (const target of targets) {
      const next = (inDegree.get(target) ?? 0) - 1;
      inDegree.set(target, Math.max(0, next));
      if (next <= 0) {
        queue.push(target);
      }
    }
  }

  if (ordered.length !== nodes.length) {
    return nodes.map((node) => node.id);
  }

  return ordered;
};

const totalWeight = (nodes: readonly CommandGraphNode[], sequence: readonly GraphNodeId[]): number =>
  nodes.reduce((sum, node) => {
    if (sequence.includes(node.id)) {
      return sum + node.weight;
    }
    return sum;
  }, 0);

export const buildCommandGraph = (
  tenant: string,
  planId: string,
  program: RecoveryProgram,
  intents: readonly CommandIntentSlot[],
): CommandGraph => {
  const nodes = buildNodes(tenant, program, intents);
  const edges = buildEdges(nodes, program);
  const sequence = topoSort(nodes, edges);

  return {
    tenant,
    planId,
    nodes,
    edges,
    criticalPathWeight: totalWeight(nodes, sequence),
    generatedAt: new Date().toISOString(),
  };
};

export const makeCommandPlan = (
  tenant: string,
  runId: string,
  program: RecoveryProgram,
  intents: readonly CommandIntentSlot[],
): CommandGraphPlan => {
  const graph = buildCommandGraph(tenant, String(program.id), program, intents);
  const sequence = topoSort(graph.nodes, graph.edges);
  return {
    tenant,
    runId,
    graph,
    estimatedDurationMs: Math.ceil(graph.criticalPathWeight),
    recommendedSequence: sequence,
  };
};

export const toDotGraph = (graph: CommandGraph): string => {
  const edges = graph.edges.map((edge) => `  ${edge.from} -> ${edge.to} [weight=${edge.weight}];`);
  const nodes = graph.nodes.map((node) => `  ${node.id} [label="${node.stepId}:${node.decision}"];`);
  return ['digraph RecoveryCommandGraph {', ...nodes, ...edges, '}'].join('\n');
};
