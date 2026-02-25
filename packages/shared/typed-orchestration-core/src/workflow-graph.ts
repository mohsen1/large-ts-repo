import type { NoInfer, JoinedTuple } from './tuple-utils';
import { head, tail } from './tuple-utils';

export type GraphNodeId<TPrefix extends string = string> = `node:${TPrefix}`;

export type GraphRoute<T extends readonly string[]> =
  T extends readonly [infer Head extends string, ...infer Tail extends readonly string[]]
    ? Tail['length'] extends 0
      ? Head
      : `${Head}/${GraphRoute<Tail>}`
    : never;

export type SegmentTuple<TValue extends string = string, TCount extends number = 6> =
  | readonly []
  | readonly [TValue, ...TValue[]]
  | (readonly [TValue, ...TValue[]]);

export type RouteKey<TEntries extends readonly [GraphNodeId, GraphNodeId][]> = {
  [TEntry in keyof TEntries]: TEntries[TEntry] extends readonly [infer From extends GraphNodeId, infer To extends GraphNodeId]
    ? From | To
    : never;
}[number];

export type WorkflowNode<TPayload = unknown> = {
  readonly id: GraphNodeId<string>;
  readonly payload: TPayload;
};

export interface WorkflowEdge {
  readonly from: GraphNodeId;
  readonly to: GraphNodeId;
  readonly weight: number;
}

export interface WorkflowPath<TPayload = unknown> {
  readonly nodes: readonly WorkflowNode<TPayload>[];
  readonly edges: readonly WorkflowEdge[];
  readonly route: `route:${string}`;
}

type ExpandNodeMap<TPayload extends Record<string, unknown>> = {
  [K in keyof TPayload as `node:${string & K}`]: TPayload[K];
};

export type NodeStateMap<TPayload extends Record<string, unknown>> = {
  [K in keyof ExpandNodeMap<TPayload>]: ExpandNodeMap<TPayload>[K];
};

export type WorkflowDiagnostics<TEntries extends readonly WorkflowEdge[]> = {
  readonly degreeIn: Readonly<Record<GraphNodeId, number>>;
  readonly degreeOut: Readonly<Record<GraphNodeId, number>>;
  readonly edges: TEntries;
};

type PathPayload<
  TPayload,
  TParts extends readonly string[],
> = TParts extends readonly [infer Head extends keyof TPayload & string, ...infer Tail extends readonly string[]]
  ? readonly [{ [K in Head]: TPayload[K] } & (Tail extends readonly [] ? {} : PathPayload<TPayload, Tail>)] & {}
  : {};

const normalizeNodeId = (value: string): GraphNodeId => `node:${value}` as GraphNodeId;

export const collectRouteSegments = <TPayload>(route: readonly WorkflowNode<TPayload>[]): readonly string[] =>
  route.map((node) => node.id.replace(/^node:/, ''));

export class WorkflowGraph<TPayload = unknown> {
  readonly #nodes = new Map<GraphNodeId, WorkflowNode<TPayload>>();
  readonly #edges: WorkflowEdge[];
  readonly #adjacency = new Map<GraphNodeId, GraphNodeId[]>();

  public constructor(nodes: readonly WorkflowNode<TPayload>[], edges: readonly WorkflowEdge[]) {
    this.#edges = [...edges];
    for (const node of nodes) {
      this.#nodes.set(node.id, node);
      this.#adjacency.set(node.id, []);
    }
    for (const edge of edges) {
      const next = this.#adjacency.get(edge.from);
      if (!next) {
        continue;
      }
      next.push(edge.to);
    }
  }

  public nodes(): readonly WorkflowNode<TPayload>[] {
    return [...this.#nodes.values()];
  }

  public edges(): readonly WorkflowEdge[] {
    return [...this.#edges];
  }

  public hasNode(id: GraphNodeId): boolean {
    return this.#nodes.has(id);
  }

  public neighbors(id: GraphNodeId): readonly GraphNodeId[] {
    return [...(this.#adjacency.get(id) ?? [])];
  }

  public route(): WorkflowPath<TPayload> {
    const ids = this.nodes().map((node) => node.id.replace(/^node:/, ''));
    return {
      nodes: this.nodes(),
      edges: this.edges(),
      route: `route:${ids.join('→')}` as `route:${string}`,
    };
  }

  public diagnostics(): WorkflowDiagnostics<readonly WorkflowEdge[]> {
    const degreeIn: Record<GraphNodeId, number> = Object.create(null);
    const degreeOut: Record<GraphNodeId, number> = Object.create(null);
    for (const edge of this.edges()) {
      degreeIn[edge.to] = (degreeIn[edge.to] ?? 0) + 1;
      degreeOut[edge.from] = (degreeOut[edge.from] ?? 0) + 1;
    }
    return {
      degreeIn,
      degreeOut,
      edges: this.edges(),
    };
  }

  public toRouteSegments(): readonly string[] {
    return collectRouteSegments(this.nodes());
  }

  public map<TOutput>(
    transform: (node: WorkflowNode<TPayload>, index: number) => WorkflowNode<TOutput>,
  ): WorkflowGraph<TOutput> {
    return new WorkflowGraph<TOutput>(
      this.nodes().map((node, index) => transform(node, index)),
      this.edges(),
    );
  }
}

export const routeMatches = <THead extends string, const TRoute extends readonly string[]>(
  route: TRoute,
  ...segments: THead extends '' ? readonly [] : [readonly [THead]]
): boolean => {
  if (segments.length === 0 || route.length === 0) {
    return false;
  }
  return route[0] === segments[0]?.[0];
};

export const buildWorkflowGraph = <TPayload extends Record<string, unknown>, const TNodes extends readonly WorkflowNode<TPayload>[]>(
  payload: NoInfer<TPayload>,
  nodes: TNodes,
  edges: readonly WorkflowEdge[],
): WorkflowGraph<TPayload> => {
  const inferred = Object.entries(payload).map(([key, value]) => ({
    id: normalizeNodeId(key),
    payload: value,
  })) as readonly WorkflowNode<TPayload>[];

  const normalizedNodes = [...nodes, ...inferred].filter((node) => node.id.startsWith('node:') && node.payload !== undefined);
  const normalizedEdges = edges
    .filter((edge) => normalizedNodes.some((node) => node.id === edge.from) && normalizedNodes.some((node) => node.id === edge.to))
    .map((edge) => ({
      ...edge,
      weight: Number.isFinite(edge.weight) ? edge.weight : 1,
    }));

  return new WorkflowGraph(normalizedNodes, normalizedEdges);
};

export const buildRouteText = <TPayload>(graph: WorkflowGraph<TPayload>): string =>
  graph.toRouteSegments().toSorted().join(' > ') as string;

export const routeTail = <TPayload>(route: readonly string[]): readonly string[] => tail(route);

export const routeHead = <TPayload>(route: readonly string[]): string => head(route) ?? '';

export const buildNodePath = <TPrefix extends string, TPayload extends readonly string[]>(
  segments: TPayload,
  prefix: TPrefix,
): string & { readonly prefix: TPrefix } =>
  `${prefix}::${joinSegments(segments, ' / ')}` as string & { readonly prefix: TPrefix };

export const joinSegments = <TEntries extends readonly string[], TDelimiter extends string>(
  values: TEntries,
  delimiter: TDelimiter,
): string => {
  let output = '';
  for (const value of values) {
    if (output.length > 0) {
      output += delimiter;
    }
    output += value;
  }
  return output as JoinedTuple<TEntries, TDelimiter>;
};

export const flattenEntries = <TPayload>(payload: readonly TPayload[]): TPayload[] =>
  payload.flatMap((value) => [value]);

export const buildPayloadPath = <TPayload extends Record<string, unknown>>(payload: TPayload): NodeStateMap<TPayload> => {
  const entries = Object.entries(payload) as Array<[keyof TPayload & string, TPayload[keyof TPayload]]>;
  return entries.reduce((state, [key, value]) => ({ ...state, [`node:${key}`]: value }), {} as NodeStateMap<TPayload>);
};

export const reduceRoute = <TPayload>(
  values: readonly TPayload[],
  fallback: TPayload,
): PathPayload<TPayload, readonly []> => {
  const next = values.reduce<TPayload | undefined>((state, value) => state ?? value, undefined);
  return (next ?? fallback) as PathPayload<TPayload, readonly []>;
};
