import { withBrand } from '@shared/core';
import { z } from 'zod';
import type { IncidentClass } from './types';

export type OrchestrationNodeKind =
  | 'intake'
  | 'analysis'
  | 'decision'
  | 'execution'
  | 'validation'
  | 'closure';

export type OrchestrationRisk = 'low' | 'medium' | 'high' | 'critical';

export type OrchestrationPolicyFlag =
  | 'requires-approval'
  | 'can-auto-continue'
  | 'safety-gated'
  | 'telemetry-required';

export interface OrchestrationNode {
  readonly id: string;
  readonly kind: OrchestrationNodeKind;
  readonly title: string;
  readonly owner: string;
  readonly createdAt: string;
  readonly flags: readonly OrchestrationPolicyFlag[];
  readonly latencyBudgetMs: number;
  readonly dependencies: readonly string[];
  readonly impactClass: IncidentClass;
}

export interface OrchestrationEdge {
  readonly sourceId: string;
  readonly targetId: string;
  readonly weight: number;
  readonly required: boolean;
  readonly description: string;
}

export interface OrchestrationGraph {
  readonly tenant: string;
  readonly runId: string;
  readonly version: number;
  readonly nodes: readonly OrchestrationNode[];
  readonly edges: readonly OrchestrationEdge[];
  readonly createdAt: string;
}

export interface OrchestrationTrace {
  readonly runId: string;
  readonly actor: string;
  readonly event: string;
  readonly nodeId?: string;
  readonly payload: Record<string, unknown>;
  readonly timestamp: string;
}

export interface OrchestrationPlanSummary {
  readonly runId: string;
  readonly risk: OrchestrationRisk;
  readonly activeNodes: number;
  readonly criticalEdges: number;
  readonly estimatedMinutes: number;
  readonly readinessGate: number;
}

export const OrchestrationNodeSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(['intake', 'analysis', 'decision', 'execution', 'validation', 'closure']),
    title: z.string().min(1),
    owner: z.string().min(1),
    createdAt: z.string().datetime(),
    flags: z.array(z.enum(['requires-approval', 'can-auto-continue', 'safety-gated', 'telemetry-required'])),
    latencyBudgetMs: z.number().finite().min(0).max(86_400_000),
    dependencies: z.array(z.string()),
    impactClass: z.enum(['infrastructure', 'database', 'network', 'application', 'third-party']),
  })
  .strict();

export const OrchestrationEdgeSchema = z
  .object({
    sourceId: z.string().min(1),
    targetId: z.string().min(1),
    weight: z.number().finite().min(0),
    required: z.boolean(),
    description: z.string().min(1),
  })
  .strict();

export const OrchestrationGraphSchema = z
  .object({
    tenant: z.string().min(1),
    runId: z.string().min(1),
    version: z.number().int().min(1),
    nodes: z.array(OrchestrationNodeSchema),
    edges: z.array(OrchestrationEdgeSchema),
    createdAt: z.string().datetime(),
  })
  .strict();

const defaultFlagsByKind: Record<OrchestrationNodeKind, readonly OrchestrationPolicyFlag[]> = {
  intake: ['telemetry-required'],
  analysis: ['telemetry-required', 'safety-gated'],
  decision: ['can-auto-continue', 'safety-gated'],
  execution: ['requires-approval', 'can-auto-continue'],
  validation: ['telemetry-required'],
  closure: ['can-auto-continue'],
};

const defaultLatencyByKind: Record<OrchestrationNodeKind, number> = {
  intake: 120_000,
  analysis: 600_000,
  decision: 180_000,
  execution: 300_000,
  validation: 240_000,
  closure: 30_000,
};

const estimateNodeMinutes = (node: Pick<OrchestrationNode, 'kind' | 'latencyBudgetMs'>): number => {
  return node.latencyBudgetMs / 60_000;
};

const scoreRisk = (
  nodes: readonly OrchestrationNode[],
  edges: readonly OrchestrationEdge[],
): OrchestrationRisk => {
  const hasCriticalEdge = edges.some((edge) => edge.required && edge.weight >= 0.85);
  const hasHighImpactExecution = nodes.some((node) => node.kind === 'execution' && node.impactClass === 'database');
  const approvalRequired = nodes.some((node) => node.flags.includes('requires-approval'));

  if (hasCriticalEdge || hasHighImpactExecution || approvalRequired) {
    return 'critical';
  }

  const highWeightEdges = edges.filter((edge) => edge.weight >= 0.7).length;
  if (highWeightEdges >= 3) {
    return 'high';
  }

  const safetyGatedCount = nodes.filter((node) => node.flags.includes('safety-gated')).length;
  if (safetyGatedCount >= 3) {
    return 'medium';
  }

  return 'low';
};

const toId = (tenant: string, kind: OrchestrationNodeKind, suffix: string): string => {
  return withBrand(`${tenant}:${kind}:${suffix}`, 'RunPlanId');
};

export const createDefaultOrchestrationNodes = (tenant: string): readonly OrchestrationNode[] => {
  const now = new Date().toISOString();
  const kinds: readonly OrchestrationNodeKind[] = ['intake', 'analysis', 'decision', 'execution', 'validation', 'closure'];
  return kinds.map((kind, index) => {
    const flags = defaultFlagsByKind[kind];
    return {
      id: toId(tenant, kind, `${index + 1}`),
      kind,
      title: `${kind.toUpperCase()} for ${tenant}`,
      owner: 'recovery-orchestrator',
      createdAt: now,
      flags,
      latencyBudgetMs: defaultLatencyByKind[kind],
      dependencies: index === 0 ? [] : [toId(tenant, kinds[index - 1]!, `${index}`)],
      impactClass: 'infrastructure',
    } as const;
  });
};

export const createDefaultOrchestrationGraph = (tenant: string, runId: string): OrchestrationGraph => {
  const nodes = createDefaultOrchestrationNodes(tenant);
  const edges: OrchestrationEdge[] = nodes
    .slice(1)
    .map((node, index) => ({
      sourceId: nodes[index]!.id,
      targetId: node.id,
      weight: 0.5 + index * 0.12,
      required: index !== 3,
      description: `${nodes[index]!.kind} -> ${node.kind} continuation`,
    }));

  const closureEdge: OrchestrationEdge = {
    sourceId: nodes[nodes.length - 1]!.id,
    targetId: nodes[0]!.id,
    weight: 0.22,
    required: false,
    description: 'feedback closure loop',
  };

  return {
    tenant,
    runId,
    version: 1,
    nodes,
    edges: [...edges, closureEdge],
    createdAt: new Date().toISOString(),
  };
};

export const summarizeOrchestrationRisk = (graph: OrchestrationGraph): OrchestrationPlanSummary => {
  const risk = scoreRisk(graph.nodes, graph.edges);
  const activeNodes = graph.nodes.length;
  const criticalEdges = graph.edges.filter((edge) => edge.weight >= 0.75).length;
  const estimatedMinutes = graph.nodes.reduce((acc, node) => acc + estimateNodeMinutes(node), 0);
  const readinessGate = activeNodes === 0 ? 0 : Number(((activeNodes - criticalEdges) / Math.max(1, activeNodes)).toFixed(2));

  return {
    runId: graph.runId,
    risk,
    activeNodes,
    criticalEdges,
    estimatedMinutes: Number(estimatedMinutes.toFixed(2)),
    readinessGate,
  };
};

export const listBlockingNodes = (graph: OrchestrationGraph): readonly OrchestrationNode[] => {
  return graph.nodes.filter((node) => node.flags.includes('requires-approval') || node.flags.includes('safety-gated'));
};

export const normalizeGraph = (graph: OrchestrationGraph): OrchestrationGraph => {
  const nodeIndex = new Set(graph.nodes.map((node) => node.id));
  const sanitizedEdges = graph.edges.filter((edge) => nodeIndex.has(edge.sourceId) && nodeIndex.has(edge.targetId));
  return {
    ...graph,
    edges: sanitizedEdges,
  };
};

export const calculateCriticalPathLength = (graph: OrchestrationGraph): number => {
  const bySource = new Map<string, readonly OrchestrationEdge[]>();
  for (const edge of graph.edges) {
    const existing = bySource.get(edge.sourceId) ?? [];
    bySource.set(edge.sourceId, [...existing, edge]);
  }

  const memo = new Map<string, number>();

  const visit = (nodeId: string): number => {
    if (memo.has(nodeId)) {
      return memo.get(nodeId)!;
    }

    const outgoing = bySource.get(nodeId) ?? [];
    if (!outgoing.length) {
      memo.set(nodeId, 0);
      return 0;
    }

    const maxChild = Math.max(
      ...outgoing.map((edge) => edge.weight + visit(edge.targetId)),
    );

    memo.set(nodeId, Number(maxChild.toFixed(4)));
    return maxChild;
  };

  return graph.nodes.reduce((acc, node) => Math.max(acc, visit(node.id)), 0);
};

export const traceForNode = (graph: OrchestrationGraph, nodeId: string, actor: string): OrchestrationTrace => {
  const isKnown = graph.nodes.some((node) => node.id === nodeId);
  return {
    runId: graph.runId,
    actor,
    event: isKnown ? 'node-present' : 'node-missing',
    nodeId: isKnown ? nodeId : undefined,
    payload: {
      tenant: graph.tenant,
      risk: summarizeOrchestrationRisk(graph).risk,
    },
    timestamp: new Date().toISOString(),
  };
};
