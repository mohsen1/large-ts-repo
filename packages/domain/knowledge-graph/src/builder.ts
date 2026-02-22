import { EdgeLabel, NodeId, NodeLabel, GraphSchema, NodeSchema, EdgeSchema, GraphType } from './schema';

export interface Node {
  id: NodeId;
  label: NodeLabel;
  payload: Record<string, unknown>;
}

export interface Edge {
  id: string;
  from: NodeId;
  to: NodeId;
  label: EdgeLabel;
  payload: Record<string, unknown>;
}

export class GraphBuilder {
  private readonly nodeDefs: Map<NodeId, Node> = new Map();
  private readonly edgeDefs: Map<string, Edge> = new Map();

  constructor(private readonly type: GraphType) {}

  addNode(node: Node): this {
    if (!this.type.getNode(node.label)) {
      throw new Error(`Unknown node label: ${node.label}`);
    }
    this.nodeDefs.set(node.id, node);
    return this;
  }

  addNodes(nodes: readonly Node[]): this {
    for (const node of nodes) this.addNode(node);
    return this;
  }

  addEdge(edge: Edge): this {
    if (!this.type.getEdge(edge.label)) {
      throw new Error(`Unknown edge label: ${edge.label}`);
    }
    const from = this.nodeDefs.get(edge.from);
    const to = this.nodeDefs.get(edge.to);
    if (!from || !to) {
      throw new Error('edge endpoints missing');
    }
    this.edgeDefs.set(edge.id, edge);
    return this;
  }

  build(): DomainGraph {
    return new DomainGraph(this.type, [...this.nodeDefs.values()], [...this.edgeDefs.values()]);
  }
}

export class DomainGraph {
  constructor(public readonly type: GraphType, public readonly nodes: Node[], public readonly edges: Edge[]) {}

  validate(): string[] {
    const errors: string[] = [];
    for (const edge of this.edges) {
      const from = this.nodes.find((n) => n.id === edge.from);
      const to = this.nodes.find((n) => n.id === edge.to);
      if (!from) errors.push(`missing from node: ${edge.from}`);
      if (!to) errors.push(`missing to node: ${edge.to}`);
      const edgeType = this.type.getEdge(edge.label);
      if (edgeType && from && from.label !== edgeType.from) {
        errors.push(`edge from label mismatch: ${from.label} != ${edgeType.from}`);
      }
      if (edgeType && to && to.label !== edgeType.to && edgeType.to !== '*') {
        errors.push(`edge to label mismatch: ${to.label} != ${edgeType.to}`);
      }
    }
    return errors;
  }

  neighbors(nodeId: NodeId): Node[] {
    const target = new Set<NodeId>();
    for (const edge of this.edges) {
      if (edge.from === nodeId) target.add(edge.to);
    }
    return this.nodes.filter((node) => target.has(node.id));
  }

  incoming(nodeId: NodeId): Node[] {
    const source = new Set<NodeId>();
    for (const edge of this.edges) {
      if (edge.to === nodeId) source.add(edge.from);
    }
    return this.nodes.filter((node) => source.has(node.id));
  }
}

export function build(schema: GraphSchema, nodes: readonly Node[], edges: readonly Edge[]): DomainGraph {
  return new DomainGraph(new GraphType(schema), [...nodes], [...edges]);
}
