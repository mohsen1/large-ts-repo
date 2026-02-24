import { withBrand } from '@shared/core';
import { chain } from './iterable';
import type { Branded } from './types';

export type WorkflowPhase = 'collect' | 'plan' | 'execute' | 'verify' | 'close';
export type WorkflowNodeKind = 'input' | 'transform' | 'observe' | 'emit';
export type WorkflowEdgeDirection = 'to' | 'from';

export type WorkflowRouteKey<T extends string = string> = `route:${T}`;
export type WorkflowLabel<T extends string, U extends WorkflowPhase> = `${T}:${U}`;
export type WorkspaceRoute<T extends string = string> = `workspace:${T}`;
export type PluginLikeEvent<T extends string = string> = `${T}::${T}`;

export type NodeIdentifier<TSpace extends string = string> = Branded<
  `${TSpace}:${string}`,
  `WorkflowNode:${TSpace}`
>;
export type BrandedPhase<T extends WorkflowPhase> = Branded<T, `Phase:${T}`>;

export interface WorkflowContext {
  readonly phase: WorkflowPhase;
  readonly runId: string;
  readonly workspaceId: string;
}

export type WorkflowNodeTuple<TInput = unknown, TOutput = unknown> = readonly [WorkflowNode<TInput, TOutput>];

export interface WorkflowNode<TInput = unknown, TOutput = unknown> {
  readonly id: NodeIdentifier;
  readonly kind: WorkflowNodeKind;
  readonly phase: WorkflowPhase;
  readonly label: WorkflowLabel<WorkflowNodeKind, WorkflowPhase>;
  readonly tags: readonly string[];
  readonly run: (input: TInput, context: WorkflowContext) => Promise<TOutput> | TOutput;
}

export interface WorkflowEdge {
  readonly from: NodeIdentifier;
  readonly to: readonly NodeIdentifier[] | NodeIdentifier;
  readonly reason: string;
  readonly estimatedLatencyMs: number;
}

export interface NormalizedWorkflowEdge {
  readonly from: NodeIdentifier;
  readonly to: NodeIdentifier;
  readonly reason: string;
  readonly estimatedLatencyMs: number;
}

export interface WorkflowSeed {
  readonly nodes: readonly WorkflowNode[];
  readonly edges: readonly WorkflowEdge[];
}

export interface WorkflowValidationIssue {
  readonly code: 'missing-node' | 'cycle-detected' | 'dup-edge' | 'invalid-path';
  readonly message: string;
}

export interface WorkflowTopologySnapshot {
  readonly nodeIds: readonly NodeIdentifier[];
  readonly edgeCount: number;
  readonly phaseDistribution: Readonly<Record<WorkflowPhase, number>>;
  readonly isAcyclic: boolean;
}

export interface WorkflowPath {
  readonly nodes: readonly NodeIdentifier[];
  readonly durationMs: number;
}

export const nodeId = (space: string, token: string): NodeIdentifier =>
  withBrand(`${space}:${token}`, `WorkflowNode:${space}` as const);

const normalizeEdges = (edges: readonly WorkflowEdge[]): readonly NormalizedWorkflowEdge[] => {
  const normalized: NormalizedWorkflowEdge[] = [];
  for (const edge of edges) {
    const destinations = (Array.isArray(edge.to) ? edge.to : [edge.to]) as readonly NodeIdentifier[];
    for (const destination of destinations) {
      normalized.push({
        from: edge.from,
        to: destination,
        reason: edge.reason,
        estimatedLatencyMs: edge.estimatedLatencyMs,
      });
    }
  }
  return normalized;
};

export class WorkflowGraph {
  readonly #nodes = new Map<NodeIdentifier, WorkflowNode>();
  readonly #outbound = new Map<NodeIdentifier, Set<NodeIdentifier>>();
  readonly #inbound = new Map<NodeIdentifier, Set<NodeIdentifier>>();
  readonly #edges: readonly NormalizedWorkflowEdge[];

  constructor(seed: WorkflowSeed) {
    for (const node of seed.nodes) {
      if (this.#nodes.has(node.id)) {
        throw new Error(`duplicate node ${node.id}`);
      }
      this.#nodes.set(node.id, node);
    }

    this.#edges = normalizeEdges(seed.edges);

    for (const edge of this.#edges) {
      if (!this.#nodes.has(edge.from) || !this.#nodes.has(edge.to)) {
        throw new Error(`orphan edge ${edge.from} -> ${edge.to}`);
      }
      const fromSet = this.#outbound.get(edge.from) ?? new Set<NodeIdentifier>();
      const toSet = this.#inbound.get(edge.to) ?? new Set<NodeIdentifier>();
      fromSet.add(edge.to);
      toSet.add(edge.from);
      this.#outbound.set(edge.from, fromSet);
      this.#inbound.set(edge.to, toSet);
    }

    if (new Set(this.#edges.map((edge) => `${edge.from}->${edge.to}`)).size !== this.#edges.length) {
      throw new Error('duplicate edge in workflow seed');
    }
  }

  nodes(): readonly WorkflowNode[] {
    return [...this.#nodes.values()];
  }

  edges(): readonly NormalizedWorkflowEdge[] {
    return this.#edges;
  }

  nodeCount(): number {
    return this.#nodes.size;
  }

  outNeighbors(nodeId: NodeIdentifier): readonly NodeIdentifier[] {
    return [...(this.#outbound.get(nodeId) ?? new Set())];
  }

  inNeighbors(nodeId: NodeIdentifier): readonly NodeIdentifier[] {
    return [...(this.#inbound.get(nodeId) ?? new Set())];
  }

  has(nodeId: NodeIdentifier): boolean {
    return this.#nodes.has(nodeId);
  }

  get(nodeId: NodeIdentifier): WorkflowNode | undefined {
    return this.#nodes.get(nodeId);
  }

  roots(): readonly NodeIdentifier[] {
    return [...this.#nodes.keys()].filter((candidate) => this.inNeighbors(candidate).length === 0);
  }

  sinks(): readonly NodeIdentifier[] {
    return [...this.#nodes.keys()].filter((candidate) => this.outNeighbors(candidate).length === 0);
  }

  toPayloadMap(): Readonly<Record<string, WorkflowNodeKind>> {
    const payload: Record<string, WorkflowNodeKind> = {};
    for (const node of this.#nodes.values()) {
      payload[node.id as string] = node.kind;
    }
    return payload;
  }

  toRouteMap(): Readonly<Record<string, readonly NodeIdentifier[]>> {
    const map: Record<string, NodeIdentifier[]> = {};
    for (const edge of this.#edges) {
      const key = edge.from as string;
      const to = map[key] ?? [];
      to.push(edge.to);
      map[key] = to;
    }
    return map;
  }

  toPathMap(): Readonly<Record<string, WorkflowRouteKey>> {
    return Object.entries(this.toRouteMap()).reduce(
      (acc, [source, targets]) => ({
        ...acc,
        [source]: `${source}::${targets.join('->')}` as WorkflowRouteKey,
      }),
      {} as Record<string, WorkflowRouteKey>,
    );
  }

  routeMap(): Readonly<Record<string, WorkflowRouteKey>> {
    const paths = this.toPathMap();
    return {
      ...paths,
    };
  }

  toSnapshot(): WorkflowTopologySnapshot {
    const buckets = this.nodes().reduce(
      (acc, node) => {
        const next = { ...acc };
        next[node.phase] = (next[node.phase] ?? 0) + 1;
        return next;
      },
      { collect: 0, plan: 0, execute: 0, verify: 0, close: 0 } as Record<WorkflowPhase, number>,
    );

    const issues = this.validate();
    return {
      nodeIds: [...this.#nodes.keys()],
      edgeCount: this.#edges.length,
      phaseDistribution: buckets,
      isAcyclic: issues.every((issue) => issue.code !== 'cycle-detected'),
    };
  }

  validate(): readonly WorkflowValidationIssue[] {
    const issues: WorkflowValidationIssue[] = [];
    const seen = new Set<string>();
    for (const edge of this.#edges) {
      if (!this.#nodes.has(edge.from) || !this.#nodes.has(edge.to)) {
        issues.push({
          code: 'missing-node',
          message: `edge ${edge.from} -> ${edge.to} refers to missing node`,
        });
      }
      const signature = `${edge.from}->${edge.to}`;
      if (seen.has(signature)) {
        issues.push({
          code: 'dup-edge',
          message: `duplicate edge ${signature}`,
        });
      }
      seen.add(signature);
    }

    try {
      const order = this.topologicalOrder();
      if (order.length !== this.#nodes.size) {
        issues.push({ code: 'cycle-detected', message: 'topological ordering missed nodes' });
      }
    } catch {
      issues.push({ code: 'cycle-detected', message: 'cycle detected while sorting workflow graph' });
    }

    if (Object.keys(this.toPayloadMap()).length === 0) {
      issues.push({ code: 'invalid-path', message: 'workflow has no nodes' });
    }

    return issues;
  }

  topologicalOrder(): readonly NodeIdentifier[] {
    const inDegree = new Map<NodeIdentifier, number>();
    for (const nodeId of this.#nodes.keys()) {
      inDegree.set(nodeId, this.inNeighbors(nodeId).length);
    }

    const queue = [...this.roots()];
    const order: NodeIdentifier[] = [];
    const visited = new Set<NodeIdentifier>();

    while (queue.length > 0) {
      const current = queue.shift() as NodeIdentifier | undefined;
      if (!current || visited.has(current)) {
        continue;
      }
      visited.add(current);
      order.push(current);

      for (const next of this.outNeighbors(current)) {
        const nextIn = inDegree.get(next) ?? 0;
        const remaining = nextIn - 1;
        inDegree.set(next, remaining);
        if (remaining <= 0) {
          queue.push(next);
        }
      }
    }

    if (order.length !== this.#nodes.size) {
      throw new Error('graph cycle or disconnected path');
    }

    return order;
  }

  criticalPaths(): readonly WorkflowPath[] {
    const routeBudget = this.sinks().map((sink) => {
      const path = this.rebuildPath(sink);
      const duration = path.reduce((sum, nodeId, index) => {
        const prev = path[index - 1];
        if (!prev) {
          return sum;
        }
        const edge = this.#edges.find((entry) => entry.from === prev && entry.to === nodeId);
        return sum + (edge?.estimatedLatencyMs ?? 0);
      }, 0);
      return [path, duration] as const;
    });

    return routeBudget.map(([nodes, durationMs]) => ({ nodes, durationMs }));
  }

  private rebuildPath(sink: NodeIdentifier): readonly NodeIdentifier[] {
    const path: NodeIdentifier[] = [sink];
    let cursor = sink;
    while (true) {
      const predecessor = this.inNeighbors(cursor)[0];
      if (!predecessor) {
        break;
      }
      path.unshift(predecessor);
      cursor = predecessor;
    }
    return path;
  }
}

export interface WorkflowPathSignature<T extends readonly WorkflowNode[]> {
  readonly tuple: T;
  readonly route: WorkflowRouteKey<T[number] extends WorkflowNode ? `${T[number]['kind']}` : never>;
}

export const buildNodeLabel = (kind: WorkflowNodeKind, phase: WorkflowPhase): WorkflowLabel<WorkflowNodeKind, WorkflowPhase> =>
  `${kind}:${phase}`;

export const createNode = <TInput = unknown, TOutput = unknown>(seed: {
  readonly kind: WorkflowNodeKind;
  readonly phase: WorkflowPhase;
  readonly namespace: string;
  readonly name: string;
  readonly tags: readonly string[];
  readonly run: (input: TInput, context: WorkflowContext) => Promise<TOutput> | TOutput;
}): WorkflowNode<TInput, TOutput> => ({
  id: withBrand(`${seed.namespace}:${seed.name}`, `WorkflowNode:${seed.namespace}` as const),
  kind: seed.kind,
  phase: seed.phase,
  label: buildNodeLabel(seed.kind, seed.phase),
  tags: [...seed.tags],
  run: seed.run,
});

export const createWorkflowNode = createNode;

export const defaultWorkflowSeed = (): WorkflowSeed => {
  const source = createNode({
    kind: 'input',
    phase: 'collect',
    namespace: 'input',
    name: 'source',
    tags: ['seed', 'collect'],
    run: async (input: { readonly tenant: string }) => ({
      tenant: input.tenant,
      capturedAt: new Date().toISOString(),
      source: 'seed',
    }),
  }) as WorkflowNode;

  const planner = createNode({
    kind: 'transform',
    phase: 'plan',
    namespace: 'transform',
    name: 'planner',
    tags: ['seed', 'plan'],
    run: async (input: { readonly tenant: string; readonly capturedAt: string }) => ({
      tenant: input.tenant,
      steps: Math.max(1, input.capturedAt.length / 4),
    }),
  }) as WorkflowNode;

  const inspector = createNode({
    kind: 'observe',
    phase: 'verify',
    namespace: 'observe',
    name: 'inspector',
    tags: ['seed', 'verify'],
    run: async (input: { readonly steps: number; readonly tenant: string }) => ({
      tenant: input.tenant,
      confidence: Math.min(1, input.steps / 4),
    }),
  }) as WorkflowNode;

  const resolver = createNode({
    kind: 'emit',
    phase: 'close',
    namespace: 'emit',
    name: 'resolver',
    tags: ['seed', 'close'],
    run: async (input: { readonly confidence: number; readonly tenant: string }) => ({
      tenant: input.tenant,
      result: input.confidence > 0.5,
    }),
  }) as WorkflowNode;

  return {
    nodes: [source, planner, inspector, resolver],
    edges: [
      { from: source.id, to: planner.id, reason: `${source.label}::${planner.label}`, estimatedLatencyMs: 11 },
      { from: planner.id, to: inspector.id, reason: `${planner.label}::${inspector.label}`, estimatedLatencyMs: 17 },
      { from: inspector.id, to: resolver.id, reason: `${inspector.label}::${resolver.label}`, estimatedLatencyMs: 23 },
    ],
  };
};

export const defaultGraphSeed = defaultWorkflowSeed;

export const summarizeGraph = (graph: WorkflowGraph, label: string): string => {
  const snapshot = graph.toSnapshot();
  return `${label}:${snapshot.nodeIds.length}:${snapshot.edgeCount}:${snapshot.isAcyclic}`;
};

export const buildRouteSignatures = (graph: WorkflowGraph): readonly WorkflowRouteKey[] => {
  return chain(Object.values(graph.routeMap())).map((path) => path).toArray();
};

export const workspaceRunSummary = (graph: WorkflowGraph, runId: string): string => {
  const phases = graph.nodes().map((node) => node.phase);
  const critical = graph.criticalPaths()[0];
  const duration = critical?.durationMs ?? 0;
  return `${runId}-${nodeCount(graph)}-${phases.length}-${duration}`;
};

const nodeCount = (graph: WorkflowGraph): number => graph.nodes().length;
