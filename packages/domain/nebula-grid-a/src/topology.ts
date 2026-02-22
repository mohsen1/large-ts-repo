import {
  type GraphDefinition,
  type GraphEdge,
  type GridContext,
  type GridHealth,
  type GraphId,
  type NodeId,
  type EdgeId,
  type GraphEvent,
  type HealthReport,
  type NodeEvent,
  type GridNodeBase,
  type EdgeKind,
} from './primitives';

export type TopologyPolicy = {
  readonly enforceAcyclic: boolean;
  readonly forbidCrossRegionEdges: boolean;
  readonly maxOutDegree: number;
  readonly maxHopCount: number;
};

export interface TopologyPlan {
  readonly id: GraphId;
  readonly policy: TopologyPolicy;
  readonly desiredNodeCount: number;
  readonly desiredEdgeCount: number;
  readonly createdAt: number;
  readonly requestedBy: string;
}

export interface TopologyValidationIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
  readonly severity: 'error' | 'warning';
}

export interface TopologyValidationReport {
  readonly graph: GraphId;
  readonly issues: ReadonlyArray<TopologyValidationIssue>;
  readonly valid: boolean;
}

type ValidationInput = Pick<GraphDefinition, 'nodes' | 'edges' | 'ctx'>;

export class TopologyResolver {
  private readonly nodes = new Map<NodeId, GridNodeBase>();
  private readonly edges = new Map<EdgeId, GraphEdge>();
  private readonly adjacency = new Map<NodeId, Set<NodeId>>();

  constructor(
    private readonly policy: TopologyPolicy,
    private readonly ctx: GridContext,
  ) {}

  apply(graph: GraphDefinition): TopologyValidationReport {
    this.nodes.clear();
    this.edges.clear();
    this.adjacency.clear();

    for (const node of graph.nodes) {
      this.nodes.set(node.id, node);
    }

    for (const edge of graph.edges) {
      this.edges.set(edge.id, edge);
      const next = this.adjacency.get(edge.from) ?? new Set<NodeId>();
      next.add(edge.to);
      this.adjacency.set(edge.from, next);
    }

    const issues: TopologyValidationIssue[] = [];

    if (this.policy.enforceAcyclic && this.detectCycle()) {
      issues.push({
        code: 'TOPO-001',
        path: '/edges',
        message: 'Cycle detected in graph topology',
        severity: 'error',
      });
    }

    for (const edge of graph.edges) {
      if (this.policy.forbidCrossRegionEdges) {
        const fromRegion = this.nodes.get(edge.from)?.region;
        const toRegion = this.nodes.get(edge.to)?.region;
        if (fromRegion && toRegion && fromRegion !== toRegion) {
          issues.push({
            code: 'TOPO-002',
            path: edge.id,
            message: 'Cross-region edge is forbidden by topology policy',
            severity: 'error',
          });
        }
      }

      if (edge.kind === 'meta' && edge.capacityPerSecond < 1) {
        issues.push({
          code: 'TOPO-003',
          path: edge.id,
          message: 'Meta edge requires positive capacity',
          severity: 'warning',
        });
      }
    }

    for (const nodeId of this.nodes.keys()) {
      const outbound = this.adjacency.get(nodeId)?.size ?? 0;
      const inbound = [...this.edges.values()].filter((edge) => edge.to === nodeId).length;
      if (outbound > this.policy.maxOutDegree) {
        issues.push({
          code: 'TOPO-004',
          path: nodeId,
          message: `Out-degree ${outbound} exceeds limit ${this.policy.maxOutDegree}`,
          severity: 'warning',
        });
      }
      if (outbound + inbound > this.policy.maxHopCount * 2) {
        issues.push({
          code: 'TOPO-005',
          path: nodeId,
          message: `Node connectivity is above allowed hop pressure`,
          severity: 'warning',
        });
      }
    }

    return { graph: graph.id, issues, valid: !issues.some((i) => i.severity === 'error') };
  }

  private detectCycle(): boolean {
    const visiting = new Set<NodeId>();
    const visited = new Set<NodeId>();

    const visit = (nodeId: NodeId): boolean => {
      if (visiting.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;
      visiting.add(nodeId);
      visited.add(nodeId);
      const next = this.adjacency.get(nodeId);
      if (!next) {
        visiting.delete(nodeId);
        return false;
      }

      for (const child of next) {
        if (visit(child)) return true;
      }

      visiting.delete(nodeId);
      return false;
    };

    for (const nodeId of this.nodes.keys()) {
      if (visit(nodeId)) return true;
    }
    return false;
  }

  hasPath(from: NodeId, to: NodeId): boolean {
    if (from === to) return true;
    const frontier: NodeId[] = [from];
    const seen = new Set<NodeId>([from]);
    while (frontier.length > 0) {
      const current = frontier.pop();
      if (!current) break;
      const next = this.adjacency.get(current);
      if (!next) continue;
      for (const child of next) {
        if (child === to) return true;
        if (!seen.has(child)) {
          seen.add(child);
          frontier.push(child);
        }
      }
    }
    return false;
  }

  outgoing(node: NodeId): ReadonlyArray<EdgeId> {
    const result: EdgeId[] = [];
    for (const edge of this.edges.values()) {
      if (edge.from === node) result.push(edge.id);
    }
    return result;
  }

  incoming(node: NodeId): ReadonlyArray<EdgeId> {
    const result: EdgeId[] = [];
    for (const edge of this.edges.values()) {
      if (edge.to === node) result.push(edge.id);
    }
    return result;
  }
}

export function createHealthReport(ctx: GridContext, nodes: readonly GridNodeBase[], edges: readonly GraphEdge[]): HealthReport {
  const nodeHealth: Record<NodeId, GridHealth> = {};
  const edgeHealth: Record<EdgeId, GridHealth> = {};
  for (const node of nodes) {
    nodeHealth[node.id] = node.metrics.observed > 0 ? 'ok' : 'warning';
  }
  for (const edge of edges) {
    edgeHealth[edge.id] = edge.metrics.throughput > edge.capacityPerSecond * 0.9 ? 'critical' : 'ok';
  }
  const failures = Object.values(nodeHealth).filter((status) => status === 'critical').length +
    Object.values(edgeHealth).filter((status) => status === 'critical').length;
  const checks = nodes.length + edges.length + ctx.revision;
  return {
    graph: `graph-${ctx.id}`,
    nodeHealth,
    edgeHealth,
    summary: {
      score: Math.max(0, Math.min(100, checks - failures * 7)),
      checks,
      failed: failures,
    },
  };
}

export function eventFor(
  source: string,
  type: GraphEvent['type'],
  payload: Readonly<Record<string, unknown>>,
): GraphEvent {
  const value = `graph-${source}` as GraphId;
  return {
    stamp: 0 as never,
    source: value,
    type,
    payload,
  };
}

export function nodeEvent<TPayload>(node: NodeId, type: NodeEvent<TPayload>['type'], payload: TPayload): NodeEvent<TPayload> {
  return {
    node,
    type,
    payload,
  };
}

export const PolicyDefaults: TopologyPolicy = {
  enforceAcyclic: true,
  forbidCrossRegionEdges: false,
  maxOutDegree: 16,
  maxHopCount: 8,
};

export const TopologyPolicies: ReadonlyArray<TopologyPolicy> = [
  PolicyDefaults,
  { enforceAcyclic: false, forbidCrossRegionEdges: true, maxOutDegree: 8, maxHopCount: 6 },
  { enforceAcyclic: true, forbidCrossRegionEdges: false, maxOutDegree: 32, maxHopCount: 12 },
];

export function withPolicy(plan: TopologyPlan, policy: TopologyPolicy): TopologyPlan {
  return { ...plan, policy };
}

export function validatePlan(plan: TopologyPlan, input: ValidationInput): TopologyValidationReport {
  const resolver = new TopologyResolver(plan.policy, input.ctx);
  return resolver.apply({
    id: plan.id,
    ctx: input.ctx,
    nodes: input.nodes,
    edges: input.edges,
    created: Date.now(),
  });
}

export function estimateResilience(nodes: ReadonlyArray<GraphNodeSummary>): number {
  let score = 1;
  for (const node of nodes) {
    if (node.regionCount === 1) score *= 0.96;
    if (node.hasControl) score *= 1.01;
    if (node.hasControl && node.edgeCount > 50) score *= 0.98;
  }
  return Math.max(0, Math.min(1, score));
}

export interface GraphNodeSummary {
  readonly kind: import('./primitives').GridNodeBase['kind'];
  readonly regionCount: number;
  readonly edgeCount: number;
  readonly hasControl: boolean;
}

export interface TopologyDiff {
  readonly from: GraphId;
  readonly to: GraphId;
  readonly addedNodes: ReadonlyArray<NodeId>;
  readonly removedNodes: ReadonlyArray<NodeId>;
  readonly addedEdges: ReadonlyArray<EdgeId>;
  readonly removedEdges: ReadonlyArray<EdgeId>;
}

export function diffTopology(old: GraphDefinition, next: GraphDefinition): TopologyDiff {
  const oldNodes = new Set(old.nodes.map((node) => node.id));
  const nextNodes = new Set(next.nodes.map((node) => node.id));
  const addedNodes = [...next.nodes].filter((node) => !oldNodes.has(node.id)).map((node) => node.id);
  const removedNodes = [...old.nodes].filter((node) => !nextNodes.has(node.id)).map((node) => node.id);

  const oldEdges = new Map(old.edges.map((edge) => [edge.id, edge]));
  const nextEdges = new Map(next.edges.map((edge) => [edge.id, edge]));
  const addedEdges = [...next.edges].filter((edge) => !oldEdges.has(edge.id)).map((edge) => edge.id);
  const removedEdges = [...old.edges].filter((edge) => !nextEdges.has(edge.id)).map((edge) => edge.id);

  return {
    from: old.id,
    to: next.id,
    addedNodes,
    removedNodes,
    addedEdges,
    removedEdges,
  };
}

export const topologyShims: Record<string, (input: string) => string> = {
  default: (input) => input,
  reverse: (input) => [...input].reverse().join(''),
  scrub: (input) => input.trim().replace(/\s+/g, '-'),
  lower: (input) => input.toLowerCase(),
  upper: (input) => input.toUpperCase(),
  slug: (input) => input.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
};

export function renderTopologyPolicy(policy: TopologyPolicy): string {
  return [
    `${policy.enforceAcyclic ? 'acyclic' : 'cyclic'}`,
    `${policy.forbidCrossRegionEdges ? 'region-locked' : 'region-open'}`,
    `${policy.maxOutDegree}-out`,
    `${policy.maxHopCount}-hops`,
  ].join('|');
}
