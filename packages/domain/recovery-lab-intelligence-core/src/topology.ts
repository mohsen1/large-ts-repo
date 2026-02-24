import type { Brand } from '@shared/core';
import type { StrategyMode, StrategyLane } from './types';

export const topologyLevels = ['seed', 'signal', 'analysis', 'decision', 'execution', 'review'] as const;
export const topologyKinds = ['plugin', 'metric', 'guard', 'fallback', 'report'] as const;

export type TopologyLevel = (typeof topologyLevels)[number];
export type TopologyKind = (typeof topologyKinds)[number];
export type TopologyId = Brand<string, 'TopologyId'>;
export type TopologyNodeId = Brand<string, 'TopologyNodeId'>;
export type TopologyRoute<T extends string = string> = `${T}::topology`;
export type NodeKindRoute<TKind extends string> = `${TKind}/node`;
export type TopologyFingerprint = Brand<string, 'TopologyFingerprint'>;
export type TopologyRoutePrefix = Brand<string, 'TopologyRoutePrefix'>;

export interface TopologySignature {
  readonly workspace: string;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly checksum: number;
}

export interface BaseTopologyPayload extends Record<string, unknown> {
  level: TopologyLevel;
  lane: StrategyLane;
  mode: StrategyMode;
  score: number;
}

export interface TopologyNode<
  TId extends string = string,
  TData extends Record<string, unknown> = Record<string, unknown>,
> {
  id: TopologyNodeId & Brand<TId, 'TopologyNodeId'>;
  kind: TopologyKind;
  label: string;
  route: TopologyRoute<TId>;
  payload: (BaseTopologyPayload & TData) & Record<string, unknown>;
}

export interface TopologyEdge {
  id: Brand<string, 'TopologyEdgeId'>;
  from: TopologyNodeId;
  to: TopologyNodeId;
  active: boolean;
  weight: number;
  tags: string[];
}

export interface TopologyNodeSpec<TName extends string, TData extends Record<string, unknown> = Record<string, unknown>> {
  name: TName;
  kind: TopologyKind;
  level: TopologyLevel;
  mode: StrategyMode;
  lane: StrategyLane;
  seed: number;
  payload: TData;
}

export interface TopologyRecord {
  readonly nodes: Readonly<Record<string, TopologyNode>>;
  readonly edges: Readonly<Record<string, TopologyEdge>>;
}

const asTopologyId = (value: string): TopologyId => value as TopologyId;
const asTopologyNodeId = (value: string): TopologyNodeId => value as TopologyNodeId;

export const isTopologyLevel = (value: string): value is TopologyLevel => topologyLevels.includes(value as TopologyLevel);

export const normalizeScore = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(Math.min(1, Math.max(0, value)).toFixed(6));
};

export interface TopologyFactory {
  build(): TopologyRecord;
  edges(): TopologyEdge[];
  nodes(): TopologyNode[];
}

export class TopologyBuilder implements TopologyFactory {
  #nodes = new Map<string, TopologyNode>();
  #edges = new Map<string, TopologyEdge>();
  #history: string[];
  #workspace: TopologyId;

  constructor(workspace: TopologyId, history: string[] = []) {
    this.#workspace = workspace;
    this.#history = history;
  }

  get nodeCount() {
    return this.#nodes.size;
  }

  get edgeCount() {
    return this.#edges.size;
  }

  addNode<TData extends Record<string, unknown>>(spec: TopologyNodeSpec<string, TData>): TopologyBuilder {
    const id = asTopologyNodeId(`${spec.name}:${this.#nodes.size + 1}`);
    const mergedPayload = normalizeTopologyPayload(spec.level, spec.mode, spec.lane, spec.seed, spec.payload);
    const node: TopologyNode = {
      id,
      kind: spec.kind,
      label: spec.name,
      route: `${spec.mode}/${spec.lane}` as TopologyRoute<string>,
      payload: mergedPayload,
    };
    this.#nodes.set(id, node);
    return this;
  }

  addEdge(from: string, to: string, weight = 1, tags: string[] = []): TopologyBuilder {
    const fromNode = this.#nodes.get(from as TopologyNodeId);
    const toNode = this.#nodes.get(to as TopologyNodeId);
    if (!fromNode || !toNode) {
      throw new Error(`edge references missing node(s): ${from}->${to}`);
    }
    this.#edges.set(`${from}->${to}`, {
      id: `edge-${from}-to-${to}` as Brand<string, 'TopologyEdgeId'>,
      from: fromNode.id,
      to: toNode.id,
      active: true,
      weight,
      tags,
    });
    return this;
  }

  listNodes(): TopologyNode[] {
    return [...this.#nodes.values()];
  }

  listEdges(): TopologyEdge[] {
    return [...this.#edges.values()];
  }

  edges(): TopologyEdge[] {
    return this.listEdges();
  }

  nodes(): TopologyNode[] {
    return this.listNodes();
  }

  build(): TopologyRecord {
    const nodes: Record<string, TopologyNode> = {};
    const edges: Record<string, TopologyEdge> = {};
    for (const node of this.listNodes()) {
      nodes[`${node.kind}_${node.payload.lane}`] = node;
    }
    for (const edge of this.listEdges()) {
      edges[`${edge.from}->${edge.to}`] = edge;
    }
    return { nodes, edges };
  }

  withHistory(hint: string): TopologyBuilder {
    return new TopologyBuilder(this.#workspace, [...this.#history, hint]);
  }

  sorted(): TopologyBuilder {
    const nodes = this.listNodes().sort((left, right) => left.route.localeCompare(right.route));
    const edges = this.listEdges().sort((left, right) => left.weight - right.weight);
    const next = new TopologyBuilder(this.#workspace, this.#history);
    for (const node of nodes) {
      next.#nodes.set(node.id, node);
    }
    for (const edge of edges) {
      next.#edges.set(`${edge.from}->${edge.to}`, edge);
    }
    return next;
  }

  toSchema(): TopologyRecord {
    return this.build();
  }

  toRouteTrace(): string[] {
    return this.#history.map((entry) => `${entry}:${this.#workspace}`);
  }
}

const normalizeTopologyPayload = <TPayload extends Record<string, unknown>>(
  level: TopologyLevel,
  mode: StrategyMode,
  lane: StrategyLane,
  seed: number,
  payload: TPayload,
): Readonly<BaseTopologyPayload & TPayload> => ({
  level,
  lane,
  mode,
  score: normalizeScore(seed),
  ...payload,
} as BaseTopologyPayload & TPayload);

export const describeNode = (node: TopologyNode): {
  [kind: string]: Array<Omit<TopologyEdge, 'from' | 'to'> & { from: string; to: string }>;
} => {
  return {
    [node.kind]: [{ id: `shape:${node.id}` as Brand<string, 'TopologyEdgeId'>, from: node.id, to: node.id, active: true, weight: 1, tags: [] }],
  };
};

export const createTopology = (
  workspace: string,
  specs: readonly TopologyNodeSpec<string, Record<string, unknown>>[],
): TopologyBuilder => {
  const builder = new TopologyBuilder(asTopologyId(workspace))
    .withHistory(`create:${workspace}`)
    .withHistory(`specs:${specs.length}`);
  for (const spec of specs) {
    builder.addNode(spec);
  }
  const nodes = builder.listNodes();
  for (let index = 1; index < nodes.length; index += 1) {
    const from = nodes[index - 1].id;
    const to = nodes[index].id;
    builder.addEdge(from, to, Math.max(1, index));
  }
  return builder.sorted();
};

export const buildTopology = (workspace: string, specs: readonly TopologyNodeSpec<string, Record<string, unknown>>[]): TopologyBuilder =>
  createTopology(workspace, specs);

const seededNodes: readonly TopologyNodeSpec<string, Record<string, unknown>>[] = [
  {
    name: 'seed-a',
    kind: 'plugin',
    level: 'seed',
    mode: 'simulate',
    lane: 'forecast',
    seed: 0.81,
    payload: {
      level: 'seed',
      lane: 'forecast',
      mode: 'simulate',
      score: 0.81,
    },
  },
  {
    name: 'seed-b',
    kind: 'metric',
    level: 'analysis',
    mode: 'analyze',
    lane: 'resilience',
    seed: 0.7,
    payload: {
      level: 'analysis',
      lane: 'resilience',
      mode: 'analyze',
      score: 0.7,
    },
  },
];

export const baseTopologyBuilder = (): TopologyBuilder => createTopology('workspace:recovery-lab-intelligence', seededNodes);

export const normalizeTopologyNodeId = (nodeId: string): TopologyNodeId => asTopologyNodeId(nodeId);

export const topologyRoute = <TWorkspace extends string>(workspace: TWorkspace): TopologyRoute<TWorkspace> =>
  `${workspace}::topology` as TopologyRoute<TWorkspace>;

export const asTopologyRoutePrefix = (value: string): TopologyRoutePrefix => value as TopologyRoutePrefix;
export const buildTopologyFingerprint = (signature: TopologySignature): TopologyFingerprint => {
  const data = `${signature.workspace}|${signature.nodeCount}|${signature.edgeCount}|${signature.checksum}`;
  return `fingerprint:${data}` as TopologyFingerprint;
};

export const computeTopologyFingerprint = (nodes: TopologyNode[]): TopologyFingerprint => {
  const text = nodes.map((node) => `${node.id}::${node.payload.mode}::${node.payload.lane}`).sort().join('|');
  const hashSeed = text.split('').reduce(
    (acc, char) => (acc * 31 + (char.codePointAt(0) ?? 0)) % 0x7fffffff,
    7,
  );
  return `fingerprint:${nodes.at(0)?.route ?? 'workspace'}:${hashSeed}` as TopologyFingerprint;
};

export const selectNode = (nodes: TopologyNode[], lane: StrategyLane): TopologyNode[] => {
  return nodes.filter((node) => node.payload.lane === lane);
};
