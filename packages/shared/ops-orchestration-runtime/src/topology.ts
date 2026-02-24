import { Brand } from '@shared/type-level';
import {
  OrchestrationGraphPlan,
  RuntimeArtifact,
  RuntimeArtifactPath,
  RuntimeNamespace,
  StageDescriptor,
  StageIdentifier,
  OrchestratorPhase,
} from './domain.js';

export type EdgeId = Brand<string, 'edge-id'>;
export type NodeId = Brand<string, 'node-id'>;

export interface RuntimeEdge {
  readonly edgeId: EdgeId;
  readonly source: NodeId;
  readonly target: NodeId;
}

export interface RuntimeNode {
  nodeId: NodeId;
  stageId: StageIdentifier;
  phase: OrchestratorPhase;
  inbound: EdgeId[];
  outbound: EdgeId[];
}

export interface RuntimeGraph<TNodes extends Record<string, RuntimeNode> = Record<string, RuntimeNode>> {
  readonly namespace: RuntimeNamespace;
  readonly nodes: TNodes;
  readonly edges: readonly RuntimeEdge[];
  readonly byPhase: Readonly<Record<OrchestratorPhase, readonly EdgeId[]>>;
}

export type NodeMap = Record<string, RuntimeNode>;

const createNode = (stageId: string, phase: OrchestratorPhase, nodeIndex: number): RuntimeNode => ({
  nodeId: `node-${nodeIndex}` as NodeId,
  stageId: `${stageId}` as StageIdentifier,
  phase,
  inbound: [],
  outbound: [],
});

export function buildRuntimeGraph<TPlan extends OrchestrationGraphPlan<any, any, any, any>>(plan: TPlan): RuntimeGraph<NodeMap> {
  const nodes: NodeMap = {};
  const edges: RuntimeEdge[] = [];
  const byPhase: { [K in OrchestratorPhase]: EdgeId[] } = {
    intake: [],
    validate: [],
    plan: [],
    execute: [],
    verify: [],
    finalize: [],
  };

  const orderedNodes = [...plan.stages].map((stage, index) =>
    createNode(stage.stageId, stage.phase, index),
  );

  for (const node of orderedNodes) {
    nodes[node.nodeId] = node;
  }

  for (let i = 0; i < orderedNodes.length - 1; i += 1) {
    const source = orderedNodes[i];
    const target = orderedNodes[i + 1];
    const edge = {
      edgeId: `edge:${source.nodeId}->${target.nodeId}` as EdgeId,
      source: source.nodeId,
      target: target.nodeId,
    };
    edges.push(edge);

    source.outbound = [...source.outbound, edge.edgeId];
    target.inbound = [...target.inbound, edge.edgeId];
    byPhase[target.phase] = [...byPhase[target.phase], edge.edgeId];
  }

  return {
    namespace: plan.namespace,
    nodes,
    edges,
    byPhase,
  };
}

export function flattenArtifacts(graph: RuntimeGraph, artifacts: readonly RuntimeArtifact[]): RuntimeArtifact[] {
  const nodes = Object.values(graph.nodes);
  return nodes.map((node, index) => {
    const artifact = artifacts[index] ?? {
      phase: node.phase,
      kind: `stage:${node.phase}` as const,
      payload: {
        nodeId: node.nodeId,
      },
      traceId: `${graph.namespace}:${node.nodeId}` as never,
      namespace: graph.namespace,
    };
    return artifact;
  });
}

export function flattenGraphArtifacts(graph: RuntimeGraph): readonly RuntimeArtifact[] {
  const nodes = Object.values(graph.nodes);
  return nodes.map((node) => ({
    phase: node.phase,
    kind: `stage:${node.phase}` as const,
    payload: {
      stage: node.stageId,
      inbound: node.inbound,
      outbound: node.outbound,
    },
    traceId: `${graph.namespace}:${node.nodeId}` as never,
    namespace: graph.namespace,
  }));
}

export function ensureAcyclic(graph: RuntimeGraph): boolean {
  const incoming = new Map<NodeId, number>();
  for (const node of Object.values(graph.nodes)) {
    incoming.set(node.nodeId, node.inbound.length);
  }

  const ready: NodeId[] = [];
  for (const [nodeId, count] of incoming) {
    if (count === 0) {
      ready.push(nodeId);
    }
  }

  const visited = new Set<NodeId>();
  while (ready.length > 0) {
    const nodeId = ready.shift();
    if (!nodeId) {
      continue;
    }

    if (visited.has(nodeId)) {
      continue;
    }

    visited.add(nodeId);
    const node = graph.nodes[nodeId];
    for (const edgeId of node.outbound) {
      const edge = graph.edges.find((candidate) => candidate.edgeId === edgeId);
      if (!edge) {
        continue;
      }

      const target = graph.nodes[edge.target];
      const count = incoming.get(target.nodeId) ?? 0;
      const nextCount = Math.max(0, count - 1);
      incoming.set(target.nodeId, nextCount);
      if (nextCount === 0) {
        ready.push(target.nodeId);
      }
    }
  }

  return visited.size === Object.keys(graph.nodes).length;
}

export function summarizeGraph(graph: RuntimeGraph): {
  nodeCount: number;
  edgeCount: number;
  phases: Record<OrchestratorPhase, number>;
} {
  const phases: Record<OrchestratorPhase, number> = {
    intake: 0,
    validate: 0,
    plan: 0,
    execute: 0,
    verify: 0,
    finalize: 0,
  };

  for (const node of Object.values(graph.nodes)) {
    phases[node.phase] += 1;
  }

  return {
    nodeCount: Object.keys(graph.nodes).length,
    edgeCount: graph.edges.length,
    phases,
  };
}

export function extractArtifactPaths(artifacts: readonly RuntimeArtifact[]): ReadonlyArray<RuntimeArtifactPath> {
  const output: RuntimeArtifactPath[] = [];
  for (const artifact of artifacts) {
    output.push(`artifact:${artifact.phase}` as RuntimeArtifactPath);
  }
  return output;
}

export function pairwiseEdges<T>(items: readonly T[]): readonly [T, T][] {
  const pairs: Array<[T, T]> = [];
  for (let i = 0; i < items.length - 1; i += 1) {
    pairs.push([items[i], items[i + 1]]);
  }
  return pairs;
}

export function buildNodeSequence(graph: RuntimeGraph): ReadonlyArray<RuntimeNode> {
  const seen = new Set<NodeId>();
  const ordered: RuntimeNode[] = [];
  const queue = Object.values(graph.nodes).filter((node) => node.inbound.length === 0);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    if (seen.has(current.nodeId)) {
      continue;
    }

    seen.add(current.nodeId);
    ordered.push(current);

    const next = queueForOutgoing(graph, current);
    queue.push(...next);
  }

  return ordered;
}

function queueForOutgoing(graph: RuntimeGraph, node: RuntimeNode): RuntimeNode[] {
  const candidates = node.outbound
    .map((edgeId) => graph.edges.find((edge) => edge.edgeId === edgeId))
    .filter((edge): edge is RuntimeEdge => !!edge)
    .map((edge) => graph.nodes[edge.target]);

  return candidates.filter((candidate): candidate is RuntimeNode => !!candidate);
}
