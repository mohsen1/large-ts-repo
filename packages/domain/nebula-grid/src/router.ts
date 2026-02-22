import {
  type EdgeKind,
  type GraphEdge,
  type GraphId,
  type NodeId,
  type GraphDefinition,
  type NodeEvent,
  type GridContext,
  type SourceCatalog,
  type ThroughputWindow,
  type RetryPolicy,
} from './primitives';
import { diffTopology, TopologyResolver as InternalResolver, type TopologyResolver } from './topology';

export type RouteId = `route-${string}`;
export type RouteWeight = number & { readonly __brand: unique symbol };

export interface RouteMatch<TPayload = unknown> {
  readonly routeId: RouteId;
  readonly nodeId: NodeId;
  readonly when: TPayload;
  readonly weight: RouteWeight;
  readonly enabled: boolean;
}

export interface RouteTable<TPayload = unknown> {
  readonly id: RouteId;
  readonly matches: ReadonlyArray<RouteMatch<TPayload>>;
  readonly fallback: NodeId;
}

export interface RouteRun<TInput = unknown, TOutput = unknown> {
  readonly route: RouteId;
  readonly node: NodeId;
  readonly input: TInput;
  readonly output: TOutput;
  readonly elapsedMs: number;
  readonly healthy: boolean;
}

export interface RouterInput<TPayload = unknown> {
  readonly graph: GraphId;
  readonly context: GridContext;
  readonly payload: TPayload;
  readonly sourceCatalog: SourceCatalog;
  readonly throughWindow: ThroughputWindow;
  readonly retryPolicy: RetryPolicy;
}

export interface RouterResult<TOutput = unknown> {
  readonly output: TOutput;
  readonly events: ReadonlyArray<NodeEvent<unknown>>;
  readonly route: RouteId;
  readonly matchedAt: number;
  readonly confidence: number;
}

export class RoutePlanner {
  private readonly routeByNode = new Map<NodeId, RouteTable>();
  private readonly metricSamples: Record<string, number[]> = {};
  private readonly resolver: TopologyResolver;

  constructor(
    private readonly graph: GraphDefinition,
    private readonly ctx: GridContext,
  ) {
    this.resolver = new InternalResolver({ enforceAcyclic: true, forbidCrossRegionEdges: false, maxOutDegree: 32, maxHopCount: 16 }, ctx);
    this.resolver.apply(graph);
  }

  registerRoute(route: RouteTable): void {
    for (const match of route.matches) {
      this.routeByNode.set(match.nodeId, route);
      const key = `${route.id}-${match.nodeId}`;
      this.metricSamples[key] = this.metricSamples[key] ?? [];
    }
  }

  clear(): void {
    this.routeByNode.clear();
  }

  route(input: RouterInput): RouterResult<readonly string[]> {
    const start = performance.now();
    const selected = this.chooseRoute(input);
    const events: NodeEvent<unknown>[] = [];
    const outputs: string[] = [];

    let cursor = selected.match.nodeId;
    let guard = 0;

    while (cursor && guard < 512) {
      const table = this.routeByNode.get(cursor);
      events.push({ node: cursor, type: 'start', payload: { route: selected.route, attempt: guard } });
      if (!table) break;
      const fallback = table.fallback;
      const payload = `edge-${cursor}`;
      outputs.push(payload);

      const candidates = table.matches
        .filter((m) => m.enabled && selected.weight > 0)
        .sort((a, b) => Number(b.weight - a.weight));

      if (candidates.length === 0) {
        break;
      }
      const nextMatch = candidates[0];
      cursor = nextMatch.nodeId === cursor ? fallback : nextMatch.nodeId;
      guard += 1;
      events.push({ node: cursor, type: 'stop', payload: { hop: guard, next: cursor } });
    }

    const elapsedMs = Math.max(1, performance.now() - start);
    this.record(input.graph, elapsedMs);
    return {
      output: outputs,
      events,
      route: selected.route,
      matchedAt: Date.now(),
      confidence: selected.confidence,
    };
  }

  private chooseRoute(input: RouterInput): { route: RouteId; match: RouteMatch; weight: RouteWeight; confidence: number } {
    let best: { route: RouteId; match: RouteMatch; weight: RouteWeight; confidence: number } | null = null;
    for (const [nodeId, route] of this.routeByNode.entries()) {
      for (const match of route.matches) {
        const matchConfidence = this.scoreMatch(match, input);
        if (!best || matchConfidence > best.confidence) {
          best = { route: route.id, match, weight: match.weight, confidence: matchConfidence };
        }
      }
    }

    if (best) return best;
    return {
      route: `route-${input.graph}` as RouteId,
      match: {
        routeId: `route-${input.graph}` as RouteId,
        nodeId: graphRootNode(input.graph),
        when: input.payload as never,
        weight: 1 as RouteWeight,
        enabled: true,
      },
      weight: 1 as RouteWeight,
      confidence: 0.05,
    };
  }

  private scoreMatch<TPayload>(match: RouteMatch<TPayload>, input: RouterInput): number {
    const base = Number(match.weight);
    const agePenalty = Math.max(0.1, 1 - (Date.now() - input.context.window.sampleWindowMs) / 10_000);
    const windowPressure = input.throughWindow.targetRps > 0 ? Math.max(0.2, input.retryPolicy.attempts / 10) : 1;
    const enabledPenalty = match.enabled ? 1 : 0;
    return Number((base * agePenalty * windowPressure * enabledPenalty).toFixed(4));
  }

  private record(graph: GraphId, value: number): void {
    const key = `route.${graph}`;
    const bucket = this.metricSamples[key] ?? [];
    bucket.push(value);
    while (bucket.length > 128) bucket.shift();
    this.metricSamples[key] = bucket;
  }
}

export function graphRootNode(graph: GraphId): NodeId {
  return `${graph}-root-node` as NodeId;
}

export function buildRoute<TPayload>(
  graphId: GraphId,
  node: NodeId,
  matcher: (payload: TPayload) => number,
): RouteTable<TPayload> {
  const matches: RouteMatch<TPayload>[] = [];
  for (let i = 0; i < 96; i += 1) {
    matches.push({
      routeId: `route-${graphId}-${i}` as RouteId,
      nodeId: node,
      when: JSON.parse(`{"sample":${i}}`) as TPayload,
      weight: Math.max(0, 1 + i) as RouteWeight,
      enabled: true,
    });
  }

  return {
    id: `route-${graphId}`,
    matches,
    fallback: node,
  };
}

export function materializeRouteId(graph: GraphId, idx: number): RouteId {
  return `route-${graph}-${idx}` as RouteId;
}

export function routeWeight(value: number): RouteWeight {
  return Math.max(0, Math.min(1000, value)) as RouteWeight;
}

export function selectEdgeType(input: string): EdgeKind {
  if (input.startsWith('meta')) return 'meta';
  if (input.startsWith('control')) return 'control';
  return 'data';
}

export function buildMultiHop<T>(graph: GraphDefinition, planner: RoutePlanner, inputs: ReadonlyArray<T>): readonly RouteRun<T, readonly string[]>[] {
  const output: RouteRun<T, readonly string[]>[] = [];
  let cursor = graph.nodes[0]?.id ?? `graph-${graph.id}-fallback` as NodeId;
  for (let i = 0; i < inputs.length; i += 1) {
    const input = inputs[i]!;
    const run = planner.route({
      graph: graph.id,
      context: graph.ctx,
      payload: input as never,
      sourceCatalog: graph.nodes as never,
      throughWindow: graph.ctx.window,
      retryPolicy: {
        attempts: 3,
        backoffMs: [1, 2, 3],
        jitterPercent: 8,
        stopOnRetryable: false,
      },
    });
    output.push({
      route: run.route,
      node: cursor,
      input,
      output: run.output,
      elapsedMs: run.matchedAt % 3000,
      healthy: run.confidence > 0.5,
    });
    cursor = run.route as never;
  }
  return output;
}

export const prewiredRoutes = Array.from({ length: 120 }, (_, idx) => {
  const route = `route-prewired-${idx}` as RouteId;
  const matchNode = `node-${idx}` as NodeId;
  return {
    id: route,
    matches: [
      {
        routeId: route,
        nodeId: matchNode,
        when: { preset: idx } as never,
        weight: (idx + 1) as RouteWeight,
        enabled: idx % 2 === 0,
      },
    ],
    fallback: matchNode,
    };
});
