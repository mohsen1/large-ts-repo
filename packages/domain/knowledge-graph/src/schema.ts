export type NodeLabel = string & { readonly __brand: 'node-label' };
export type EdgeLabel = string & { readonly __brand: 'edge-label' };
export type NodeId = string & { readonly __brand: 'node-id' };

export interface PropertyValue {
  kind: 'string' | 'number' | 'boolean' | 'datetime' | 'object' | 'list';
  value: unknown;
}

export interface NodeSchema {
  label: NodeLabel;
  description: string;
  attributes: Record<string, PropertyValue>;
  constraints: readonly string[];
}

export interface EdgeSchema {
  label: EdgeLabel;
  from: NodeLabel;
  to: NodeLabel;
  cardinality: 'one-to-one' | 'one-to-many' | 'many-to-many';
  properties: Record<string, PropertyValue>;
}

export interface GraphSchema {
  readonly id: string;
  readonly name: string;
  readonly nodes: Map<NodeLabel, NodeSchema>;
  readonly edges: Map<EdgeLabel, EdgeSchema>;
}

export class GraphType {
  constructor(private readonly schema: GraphSchema) {}

  getNode(label: NodeLabel): NodeSchema | undefined {
    return this.schema.nodes.get(label);
  }

  getEdge(label: EdgeLabel): EdgeSchema | undefined {
    return this.schema.edges.get(label);
  }

  hasCycleCheck(from: NodeLabel, seen: Set<NodeLabel> = new Set()): boolean {
    if (seen.has(from)) return true;
    seen.add(from);
    for (const edge of this.schema.edges.values()) {
      if (edge.from === from) {
        if (this.hasCycleCheck(edge.to, new Set(seen))) return true;
      }
    }
    return false;
  }

  topologicalOrder(): NodeLabel[] {
    const order: NodeLabel[] = [];
    const visited = new Set<NodeLabel>();
    const rec = (current: NodeLabel) => {
      if (visited.has(current)) return;
      visited.add(current);
      for (const edge of this.schema.edges.values()) {
        if (edge.from === current) {
          rec(edge.to);
        }
      }
      order.push(current);
    };
    for (const label of this.schema.nodes.keys()) rec(label);
    return order;
  }
}
