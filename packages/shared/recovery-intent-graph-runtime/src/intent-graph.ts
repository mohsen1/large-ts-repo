import { iteratorChain } from '@shared/recovery-workbench-runtime';
import type { Brand } from '@shared/type-level';
import type { IntentInput, IntentOutput, IntentPluginContext, IntentSignal, PluginDescriptor } from './intent-types';
import { isRouteMatch } from './intent-types';

export type IntentNodeKind = 'source' | 'transform' | 'sink' | 'validation';

export type EdgeWeight = Brand<number, 'EdgeWeight'>;
export type IntentNodeId = Brand<string, 'IntentNodeId'>;

export interface IntentNodeDef<TKind extends IntentNodeKind = IntentNodeKind, TPayload = unknown> {
  readonly id: IntentNodeId;
  readonly kind: TKind;
  readonly title: string;
  readonly payload: TPayload;
  readonly score: number;
  readonly version: number;
}

export interface IntentEdge {
  readonly from: IntentNodeId;
  readonly to: IntentNodeId;
  readonly weight: EdgeWeight;
}

export interface IntentGraphSnapshot<TNodePayload = unknown> {
  readonly name: string;
  readonly nodes: readonly IntentNodeDef<IntentNodeKind, TNodePayload>[];
  readonly edges: readonly IntentEdge[];
  readonly tags: Readonly<Record<string, string>>;
}

type NodeIndex = ReadonlyMap<IntentNodeId, IntentNodeDef<IntentNodeKind, unknown>>;

const toNodeIndex = (nodes: readonly IntentNodeDef<IntentNodeKind, unknown>[]): NodeIndex => {
  return iteratorChain(nodes).reduce((accumulator, node) => {
    accumulator.set(node.id, node);
    return accumulator;
  }, new Map<IntentNodeId, IntentNodeDef<IntentNodeKind, unknown>>());
};

export const getIncomingByNode = (snapshot: IntentGraphSnapshot<unknown>): Readonly<Record<IntentNodeId, readonly IntentEdge[]>> => {
  const buckets = iteratorChain(snapshot.edges).reduce((accumulator, edge) => {
    const next = [...(accumulator[edge.to] ?? []), edge];
    accumulator[edge.to] = next;
    return accumulator;
  }, {} as Record<IntentNodeId, IntentEdge[]>);
  return buckets;
};

export const getOutgoingByNode = (snapshot: IntentGraphSnapshot<unknown>): Readonly<Record<IntentNodeId, readonly IntentEdge[]>> => {
  const buckets = iteratorChain(snapshot.edges).reduce((accumulator, edge) => {
    const next = [...(accumulator[edge.from] ?? []), edge];
    accumulator[edge.from] = next;
    return accumulator;
  }, {} as Record<IntentNodeId, IntentEdge[]>);
  return buckets;
};

export const makeDefaultSnapshot = <TNodePayload>(name: string, nodes: readonly IntentNodeDef<IntentNodeKind, TNodePayload>[], edges: readonly IntentEdge[]): IntentGraphSnapshot<TNodePayload> =>
  ({
    name,
    nodes,
    edges,
    tags: {
      createdBy: 'recovery-intent-graph-runtime',
      hasEdges: String(edges.length),
    },
  }) as IntentGraphSnapshot<TNodePayload>;

type TopologicalOrderState = {
  readonly nodeCount: number;
  readonly ready: readonly IntentNodeId[];
  readonly ordered: readonly IntentNodeId[];
};

const advance = (
  incoming: Readonly<Record<IntentNodeId, readonly IntentEdge[]>>,
  remaining: ReadonlySet<IntentNodeId>,
): readonly IntentNodeId[] => {
  return iteratorChain(remaining).filter((id) => {
    const dependencies = incoming[id] ?? [];
    return dependencies.every((edge) => !remaining.has(edge.from));
  }).toArray();
};

export const topologicalOrder = (snapshot: IntentGraphSnapshot<unknown>): readonly IntentNodeId[] => {
  const incoming = getIncomingByNode(snapshot);
  const remaining = new Set(snapshot.nodes.map((node) => node.id));
  const state: TopologicalOrderState = {
    nodeCount: snapshot.nodes.length,
    ready: [],
    ordered: [],
  };

  const pending = iteratorChain(Array.from(remaining))
    .filter((id) => (incoming[id] ?? []).length === 0)
    .toArray() as IntentNodeId[];
  if (pending.length === 0 && snapshot.nodes.length > 0) {
    return [];
  }

  const order: IntentNodeId[] = [...pending];
  for (const first of pending) {
    remaining.delete(first);
    const outgoing = (snapshot.edges.filter((edge) => edge.from === first) as readonly IntentEdge[]).map((edge) => edge.to);
    for (const candidate of outgoing) {
      if (!remaining.has(candidate)) continue;
      const allDeps = (incoming[candidate] ?? []).every((edge) => !remaining.has(edge.from));
      if (allDeps && !order.includes(candidate)) {
        order.push(candidate);
        remaining.delete(candidate);
      }
    }
  }

  return advance(incoming, remaining).reduce((accumulator, next) => {
    if (!accumulator.includes(next)) {
      accumulator.push(next);
    }
    return accumulator;
  }, order as IntentNodeId[]);
};

export const walkSnapshot = <TNodePayload>(snapshot: IntentGraphSnapshot<TNodePayload>): readonly IntentNodeDef<IntentNodeKind, TNodePayload>[] => {
  const ordered = topologicalOrder(snapshot as IntentGraphSnapshot<unknown>);
  const index = toNodeIndex(snapshot.nodes);
  return ordered.map((id) => index.get(id)).filter((node): node is IntentNodeDef<IntentNodeKind, TNodePayload> => node !== undefined);
};

const maxScore = (nodes: readonly IntentNodeDef<IntentNodeKind, unknown>[]): number =>
  nodes.reduce((max, node) => Math.max(max, node.score), 0);

export const scoreGraph = (snapshot: IntentGraphSnapshot<unknown>): number =>
  maxScore(snapshot.nodes) * Math.max(1, snapshot.edges.length);

export const classifyNodes = (snapshot: IntentGraphSnapshot<unknown>): Readonly<Record<IntentNodeKind, number>> => {
  const initial = {
    source: 0,
    transform: 0,
    sink: 0,
    validation: 0,
  };
  return iteratorChain(snapshot.nodes).reduce((accumulator, node) => {
    accumulator[node.kind] = accumulator[node.kind] + 1;
    return accumulator;
  }, initial);
};

const byId = (snapshot: IntentGraphSnapshot<unknown>, id: IntentNodeId): IntentNodeDef<IntentNodeKind, unknown> | undefined =>
  snapshot.nodes.find((node) => node.id === id);

export interface PathTraceResult<TPayload = unknown> {
  readonly node: IntentNodeDef<IntentNodeKind, TPayload>;
  readonly incoming: readonly IntentEdge[];
  readonly outgoing: readonly IntentEdge[];
}

export const inspectNode = <TPayload>(snapshot: IntentGraphSnapshot<TPayload>, nodeId: IntentNodeId): PathTraceResult<TPayload> | undefined => {
  const node = byId(snapshot as IntentGraphSnapshot<unknown>, nodeId);
  if (!node) return undefined;
  const incoming = (snapshot.edges as readonly IntentEdge[]).filter((edge) => edge.to === nodeId);
  const outgoing = (snapshot.edges as readonly IntentEdge[]).filter((edge) => edge.from === nodeId);
  return {
    node: node as IntentNodeDef<IntentNodeKind, TPayload>,
    incoming,
    outgoing,
  };
};

type PluginByRoute<TDescriptor extends PluginDescriptor<string, IntentInput, unknown, string, string>, TRoute extends string> =
  TDescriptor['route'] extends TRoute ? TDescriptor : never;

export const hasRouteMatch = <TDescriptor extends PluginDescriptor<string, IntentInput, unknown, string, string>>(
  route: string,
  plugin: TDescriptor,
): plugin is PluginByRoute<TDescriptor, typeof route> => isRouteMatch(plugin.route, route);

export const buildRouteIndex = <TDescriptor extends PluginDescriptor<string, IntentInput, unknown, string, string>>(
  descriptors: readonly TDescriptor[],
) => {
  const grouped = descriptors.reduce<Record<string, TDescriptor[]>>((accumulator, plugin) => {
    const key = plugin.route;
    accumulator[key] = [...(accumulator[key] ?? []), plugin];
    return accumulator;
  }, {} as Record<string, TDescriptor[]>);
  return grouped;
};

export const projectSignals = (
  snapshot: IntentGraphSnapshot<unknown>,
  context: IntentPluginContext,
): readonly IntentSignal[] => {
  const traces = walkSnapshot(snapshot);
  return iteratorChain(traces).map((node) => ({
    tenant: context.tenant,
    workspace: context.workspace,
    eventType: node.kind,
    confidence: node.score / 100,
    metadata: {
      nodeId: node.id,
      nodeTitle: node.title,
      kind: node.kind,
      version: node.version,
    },
  })).toArray();
};
