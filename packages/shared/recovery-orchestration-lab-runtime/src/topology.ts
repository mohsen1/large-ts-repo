import { z } from 'zod';

type UnknownArray = ReadonlyArray<unknown>;

type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

export const graphSchema = z.object({
  workspaceId: z.string(),
  version: z.string(),
  roots: z.array(z.string()),
  edges: z.array(z.tuple([z.string(), z.string()])),
});

export type RawTopology = z.infer<typeof graphSchema>;

export type NodeId = string & { readonly __node: unique symbol };

export type GraphNode<TId extends string = string> = {
  readonly id: Brand<TId, 'NodeId'>;
  readonly weight: number;
  readonly tags: readonly string[];
};

export interface RuntimeEdge<TId extends string = string> {
  readonly from: Brand<TId, 'NodeId'>;
  readonly to: Brand<TId, 'NodeId'>;
  readonly latencyMs: number;
}

export interface RuntimeTopology<TId extends string = string> {
  readonly nodes: readonly GraphNode<TId>[];
  readonly edges: readonly RuntimeEdge<TId>[];
}

export type Brand<T, B extends string> = T & { readonly __brand: B };

type WithBrand<T, B extends string> = T & { readonly __brand: B };

type FlattenedTuple<TTuple extends UnknownArray> =
  TTuple extends readonly [infer Head, ...infer Tail]
    ? [Head, ...FlattenedTuple<Tail & UnknownArray>]
    : [];

export type PathTuple<T extends UnknownArray> = FlattenedTuple<T>;

export type NodeTuple<TNode extends string> = [from: Brand<TNode, 'NodeId'>, ...Brand<TNode, 'NodeId'>[]];

export type PathMap<T extends RuntimeTopology> = {
  [N in T['nodes'][number]['id'] as `${N & string}=>${string}`]?: N;
};

export type ReversePathMap<TMap extends Record<string, string>> = {
  [K in keyof TMap as `rev:${K & string}`]: TMap[K];
};

export const asNodeId = <T extends string>(value: T): Brand<T, 'NodeId'> => value as Brand<T, 'NodeId'>;

export const topologyFromRaw = (raw: RawTopology): RuntimeTopology => {
  const nodeSet = new Set<string>(raw.roots);
  for (const [from, to] of raw.edges) {
    nodeSet.add(from);
    nodeSet.add(to);
  }

  const nodes = [...nodeSet].map((node, index) => ({
    id: asNodeId(node),
    weight: index + 1,
    tags: ['generated'],
  }));

  const edges = raw.edges.map(([from, to], index) => ({
    from: asNodeId(from),
    to: asNodeId(to),
    latencyMs: ((index + 1) * 10) + 5,
  }));

  return { nodes, edges };
};

export const findCriticalPath = (topology: RuntimeTopology): readonly string[] => {
  const adjacency = new Map<string, string[]>();
  for (const edge of topology.edges) {
    const list = adjacency.get(edge.from) ?? [];
    list.push(edge.to);
    adjacency.set(edge.from, list);
  }

  const order: string[] = [];
  const visited = new Set<string>();

  const walk = (node: string): void => {
    if (visited.has(node)) {
      return;
    }
    visited.add(node);
    for (const next of adjacency.get(node) ?? []) {
      walk(next);
    }
    order.push(node);
  };

  for (const node of topology.nodes) {
    walk(node.id);
  }

  return order;
};

export const routePrefix = <TPrefix extends string>(prefix: TPrefix, paths: readonly string[]): readonly string[] => {
  return paths.map((path) => `${prefix}:${path}`);
};

export const pathPairs = <T extends readonly string[]>(paths: T): PathTuple<T> =>
  paths as unknown as PathTuple<T>;

export const zipNodes = <
  TLeft extends readonly string[],
  TRight extends readonly string[],
>(left: TLeft, right: TRight): readonly (readonly [string, string])[] => {
  const zipped: [string, string][] = [];
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index++) {
    const leftValue = left[index];
    const rightValue = right[index];
    if (rightValue === undefined) {
      continue;
    }
    zipped.push([leftValue, rightValue]);
  }
  return zipped;
};

export const toPathMap = <T extends RuntimeTopology>(topology: T): Prettify<PathMap<T>> => {
  const map = {} as Record<string, unknown>;
  for (const node of topology.nodes) {
    const key = `${node.id}=>next` as string;
    map[key] = node.id;
  }
  return map as Prettify<PathMap<T>>;
};

export const toReversePathMap = <T extends Record<string, string>>(value: T): ReversePathMap<T> => {
  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [`rev:${key}`, entryValue] as const),
  ) as ReversePathMap<T>;
};

export const deriveTopologySignature = (topology: RuntimeTopology): string => {
  const nodeSignature = topology.nodes
    .map((node) => `${node.id}:${node.weight}:${node.tags.join('|')}`)
    .sort()
    .join('||');
  const edgeSignature = topology.edges
    .map((edge) => `${edge.from}->${edge.to}@${edge.latencyMs}`)
    .sort()
    .join('|');
  return `${nodeSignature}##${edgeSignature}`;
};

export const validateTopology = (value: unknown): RuntimeTopology => {
  const parsed = graphSchema.parse(value) as RawTopology;
  return topologyFromRaw(parsed);
};
