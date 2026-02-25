import { Brand } from '@shared/type-level';
import type { MeshChannel, MeshZone } from './types.js';

export type NodeId = Brand<string, 'mesh-node'>;
export type EdgeId = Brand<string, 'mesh-edge'>;

export interface MeshNode<TInput = unknown, TOutput = unknown> {
  readonly id: NodeId;
  readonly label: string;
  readonly zone: MeshZone;
  readonly channels: readonly MeshChannel[];
  readonly input: TInput;
  readonly output: TOutput;
}

export interface MeshEdge {
  readonly id: EdgeId;
  readonly from: NodeId;
  readonly to: NodeId;
  readonly latencyMs: number;
}

export type MeshGraphTuple<TNodes extends readonly unknown[]> =
  TNodes extends readonly [infer Head, ...infer Tail]
    ? Head extends MeshNode
      ? readonly [Head, ...MeshGraphTuple<Tail>]
      : readonly []
    : readonly [];

export class RuntimeTopology<TNode extends MeshNode = MeshNode> {
  readonly #nodes = new Map<NodeId, TNode>();
  readonly #edges = new Map<EdgeId, MeshEdge>();

  addNode(node: TNode): void {
    this.#nodes.set(node.id, node);
  }

  addEdge(edge: Omit<MeshEdge, 'id'>): EdgeId {
    const id = `${edge.from}->${edge.to}` as EdgeId;
    this.#edges.set(id, { ...edge, id });
    return id;
  }

  nodes(): readonly TNode[] {
    return [...this.#nodes.values()];
  }

  edges(): readonly MeshEdge[] {
    return [...this.#edges.values()];
  }

  route(from: NodeId, to: NodeId, seen = new Set<NodeId>()): readonly EdgeId[] {
    if (seen.has(from)) {
      return [];
    }
    seen.add(from);
    const candidates = [...this.#edges.values()].filter((edge) => edge.from === from);
    for (const edge of candidates) {
      if (edge.to === to) {
        return [edge.id];
      }
      const nested = this.route(edge.to, to, seen);
      if (nested.length > 0) {
        return [edge.id, ...nested];
      }
    }
    return [];
  }

  score(): number {
    return this.nodes().reduce((sum, node) => sum + node.channels.length, 0) + this.edges().length * 2;
  }

  snapshot(): { nodes: readonly string[]; edges: readonly string[]; score: number } {
    return {
      nodes: this.nodes().map((node) => node.id),
      edges: this.edges().map((edge) => edge.id),
      score: this.score(),
    };
  }
}

export const asNodeId = (value: string): NodeId => value as NodeId;
export const asEdgeId = (value: string): EdgeId => value as EdgeId;

export const routeScore = (path: readonly string[]): number => {
  return path.reduce((sum, step) => sum + step.length, 0);
};

export const orderNodes = (nodes: readonly MeshNode[]): MeshNode[] => [...nodes].sort((a, b) => a.label.localeCompare(b.label));
