import {
  WorkflowGraph,
  WorkflowNode,
  createNode,
  type WorkflowContext,
  type WorkflowNodeKind,
  type WorkflowPhase,
  type WorkflowRouteKey,
} from '@shared/orchestration-kernel';
import { chain } from '@shared/orchestration-kernel';
import type { DesignNodeId, DesignPlanId, DesignStage, DesignNode } from './contracts';

export interface DesignGraphSeed {
  readonly planId: DesignPlanId;
  readonly name: string;
  readonly stage: DesignStage;
  readonly nodes: readonly DesignNode[];
}

export type GraphTag<T extends string> = `graph:${T}`;
export type PathMap<T extends Record<string, readonly string[]>> = {
  [K in keyof T as `edge:${Extract<K, string>}`]: string[];
};

export interface GraphLane {
  readonly name: string;
  readonly nodes: readonly string[];
  readonly durationMs: number;
}

export interface GraphSnapshot {
  readonly graphId: string;
  readonly pathCount: number;
  readonly edgeCount: number;
  readonly phases: readonly DesignStage[];
  readonly isValid: boolean;
  readonly hotspots: readonly string[];
}

export type GraphNodeTuple<T extends readonly WorkflowNode[]> = {
  readonly tuple: T;
  readonly route: WorkflowRouteKey<T[number] extends WorkflowNode ? `${T[number]['label']}` : never>;
};

export type RouteSignature<TNodes extends readonly WorkflowNode[]> = TNodes extends readonly [
  infer Head,
  ...infer Tail,
]
  ? Head extends WorkflowNode
    ? `${Head['id']}/${Head['label']}` | RouteSignature<Tail extends readonly WorkflowNode[] ? Tail : readonly []>
    : never
  : never;

const designNodeKind = (index: number): WorkflowNodeKind =>
  ['input', 'transform', 'observe', 'emit'][index % 4] as WorkflowNodeKind;

const designPhase = (index: number): WorkflowPhase =>
  ['collect', 'plan', 'verify', 'close', 'execute'][index % 5] as WorkflowPhase;

const buildSeedNodes = (seed: DesignGraphSeed): readonly WorkflowNode[] => {
  const base = createNode({
    kind: designNodeKind(0),
    phase: designPhase(0),
    namespace: 'design',
    name: `${seed.name}-collect`,
    tags: ['graph', seed.stage],
    run: async (input: { readonly tenant: string }, _context: WorkflowContext) => ({
      tenant: input.tenant,
      startedAt: new Date().toISOString(),
      source: seed.name,
    }),
  }) as WorkflowNode;

  const transform = createNode({
    kind: designNodeKind(1),
    phase: designPhase(1),
    namespace: 'design',
    name: `${seed.name}-plan`,
    tags: ['graph', seed.stage, 'transform'],
    run: async (input: { readonly tenant: string; readonly startedAt: string }, _context: WorkflowContext) => ({
      tenant: input.tenant,
      startedAt: input.startedAt,
      planId: seed.planId,
    }),
  }) as WorkflowNode;

  const inspect = createNode({
    kind: designNodeKind(2),
    phase: designPhase(2),
    namespace: 'design',
    name: `${seed.name}-observe`,
    tags: ['graph', 'observe'],
    run: async (input: { readonly tenant: string; readonly planId: string }, _context: WorkflowContext) => ({
      tenant: input.tenant,
      planId: input.planId,
      checksPassed: true,
    }),
  }) as WorkflowNode;

  const emit = createNode({
    kind: designNodeKind(3),
    phase: designPhase(3),
    namespace: 'design',
    name: `${seed.name}-emit`,
    tags: ['graph', 'emit'],
    run: async (input: { readonly tenant: string; readonly checksPassed: boolean }, _context: WorkflowContext) => ({
      tenant: input.tenant,
      checksPassed: input.checksPassed,
      emittedAt: new Date().toISOString(),
    }),
  }) as WorkflowNode;

  return [base, transform, inspect, emit];
};

const buildSeedEdges = (nodes: readonly WorkflowNode[]): readonly { from: WorkflowNode['id']; to: WorkflowNode['id']; reason: string; estimatedLatencyMs: number }[] => {
  const result: Array<{ from: WorkflowNode['id']; to: WorkflowNode['id']; reason: string; estimatedLatencyMs: number }> = [];
  for (let index = 0; index < nodes.length - 1; index += 1) {
    const node = nodes[index];
    const next = nodes[index + 1];
    if (node && next) {
      result.push({
        from: node.id,
        to: next.id,
        reason: `${node.label}->${next.label}`,
        estimatedLatencyMs: (index + 1) * 12 + 5,
      });
    }
  }
  return result;
};

export const buildDesignGraph = (seed: DesignGraphSeed): WorkflowGraph => {
  const nodes = buildSeedNodes(seed);
  const edges = buildSeedEdges(nodes);
  return new WorkflowGraph({ nodes, edges });
};

export const buildGraphLanes = (graph: WorkflowGraph): readonly GraphLane[] => {
  const nodes = graph.nodes();
  const byTag = new Map<string, string[]>();
  for (const node of nodes) {
    const lane = node.label.split(':')[0] ?? 'unknown';
    const bucket = byTag.get(lane) ?? [];
    bucket.push(node.id);
    byTag.set(lane, bucket);
  }
  return [...byTag.entries()].map(([name, nodeIds]) => ({
    name,
    nodes: nodeIds,
    durationMs: nodeIds.length * 42,
  }));
};

export const snapshotGraph = (graph: WorkflowGraph): GraphSnapshot => {
  const routeCount = graph.criticalPaths().length;
  const byPhase = graph.toSnapshot().phaseDistribution;
  const hotspots = Object.entries(byPhase)
    .filter(([, count]) => count > 1)
    .map(([phase]) => phase);
  const pathMap = graph.toPathMap();
  return {
    graphId: `graph:${graph.toSnapshot().nodeIds.length}:${pathMap[graph.toSnapshot().nodeIds[0] ?? 'seed'] ?? 'none'}`,
    pathCount: routeCount,
    edgeCount: graph.toSnapshot().edgeCount,
    phases: Object.keys(byPhase) as readonly DesignStage[],
    isValid: graph.validate().every((issue) => issue.code !== 'cycle-detected'),
    hotspots,
  };
};

export const buildRouteSignatures = <T extends readonly WorkflowNode[]>(
  nodes: T,
): readonly RouteSignature<T>[] => {
  return [...nodes].map((node, index) => `${node.id}/${node.label}/${index}` as RouteSignature<T>);
};

export const traceGraphByTag = (graph: WorkflowGraph, tags: readonly string[]): readonly string[] =>
  chain(graph.nodes())
    .filter((node) => node.tags.some((tag) => tags.includes(tag)))
    .map((node) => `${node.id}:${node.tags.join(',')}`)
    .toArray();

export const summarizeGraph = (graph: WorkflowGraph, context: WorkflowContext): GraphSnapshot => {
  const routes = buildRouteSignatures(graph.nodes());
  const pathMap = graph.toPathMap();
  return {
    graphId: `${context.runId}:${context.workspaceId}`,
    pathCount: routes.length,
    edgeCount: graph.toSnapshot().edgeCount,
    phases: Object.keys(graph.toSnapshot().phaseDistribution) as readonly DesignStage[],
    isValid: graph.validate().every((issue) => issue.code !== 'cycle-detected'),
    hotspots: Object.values(pathMap).map((path) => path),
  };
};

export const asLaneTuple = <TNode extends { readonly id: DesignNodeId; readonly stage: DesignStage; readonly tags: readonly string[] }>(
  nodes: readonly TNode[],
): readonly GraphNodeIdTuple<TNode>[] => {
  const keyed = new Map<DesignStage, TNode[]>();
  for (const node of nodes) {
    const bucket = keyed.get(node.stage) ?? [];
    bucket.push(node);
    keyed.set(node.stage, bucket);
  }
  return [...keyed.values()].flatMap((group) =>
    group.map((node) => [node.id, ...node.tags] as GraphNodeIdTuple<TNode>),
  );
};

export type GraphNodeIdTuple<TNode extends { readonly id: DesignNodeId }> = readonly [TNode['id'], ...readonly string[]];
