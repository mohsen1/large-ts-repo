export type EntityId = string;

export interface LineageNode {
  id: EntityId;
  type: 'table' | 'file' | 'stream' | 'api';
  metadata: Record<string, string>;
}

export interface LineageEdge {
  from: EntityId;
  to: EntityId;
  relation: 'reads' | 'writes' | 'transforms';
  confidence: number;
}

export interface LineageGraph {
  nodes: Map<EntityId, LineageNode>;
  edges: LineageEdge[];
}

export function createGraph(): LineageGraph {
  return { nodes: new Map(), edges: [] };
}

export function addNode(graph: LineageGraph, node: LineageNode): void {
  graph.nodes.set(node.id, node);
}

export function addEdge(graph: LineageGraph, edge: LineageEdge): void {
  graph.edges.push(edge);
}

export function upstream(graph: LineageGraph, nodeId: EntityId): readonly LineageNode[] {
  const src = graph.edges.filter((edge) => edge.to === nodeId).map((edge) => edge.from);
  return [...new Set(src)].map((id) => graph.nodes.get(id)!).filter(Boolean);
}

export function downstream(graph: LineageGraph, nodeId: EntityId): readonly LineageNode[] {
  const dst = graph.edges.filter((edge) => edge.from === nodeId).map((edge) => edge.to);
  return [...new Set(dst)].map((id) => graph.nodes.get(id)!).filter(Boolean);
}

export function impacted(graph: LineageGraph, nodeId: EntityId, depth = 0, maxDepth = 10): EntityId[] {
  if (depth > maxDepth) return [];
  const children = downstream(graph, nodeId).map((node) => node.id);
  const out = [...children];
  for (const child of children) {
    out.push(...impacted(graph, child, depth + 1, maxDepth));
  }
  return out;
}
