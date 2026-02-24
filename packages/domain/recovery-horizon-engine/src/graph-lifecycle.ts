import type { Brand, NoInfer } from '@shared/type-level';
import type {
  PluginStage,
  TimeMs,
  StageLabel,
  HorizonPlan,
  PluginConfig,
  JsonLike,
  PlanId,
} from './types.js';
import { horizonBrand } from './types.js';

export type HorizonNodeId = Brand<string, 'horizon-node-id'>;
export type HorizonEdgeId = Brand<string, 'horizon-edge-id'>;
export type StageWindow = readonly PluginStage[];

type NodeWeight = Brand<number, 'node-weight'>;
type EdgeWeight = Brand<number, 'edge-weight'>;

export type StageRoute<T extends string = string> = `${T}::${number}`;

export type HorizonStagePath<T extends readonly PluginStage[]> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends PluginStage
    ? readonly [StageRoute<Head>, ...HorizonStagePath<Tail extends readonly PluginStage[] ? Tail : []>]
    : readonly []
  : readonly [];

export type NodeIndexMap<T extends readonly HorizonGraphNode[]> = ReadonlyMap<T[number]['id'], T[number]>;

export interface HorizonGraphNode<TKind extends PluginStage = PluginStage, TPayload = JsonLike> {
  readonly id: HorizonNodeId;
  readonly stage: TKind;
  readonly label: StageLabel<TKind>;
  readonly path: StageRoute<TKind>;
  readonly createdAt: TimeMs;
  readonly outputAt: TimeMs;
  readonly weight: NodeWeight;
  readonly dependencies: readonly HorizonNodeId[];
  readonly payload: TPayload;
}

export interface HorizonGraphEdge<TFrom extends PluginStage = PluginStage, TTo extends PluginStage = PluginStage> {
  readonly id: HorizonEdgeId;
  readonly from: HorizonNodeId;
  readonly to: HorizonNodeId;
  readonly fromStage: TFrom;
  readonly toStage: TTo;
  readonly weight: EdgeWeight;
  readonly reason: string;
}

export interface HorizonGraphSnapshot {
  readonly tenantId: string;
  readonly planId: string;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly nodes: readonly HorizonGraphNode[];
  readonly edges: readonly HorizonGraphEdge[];
}

export interface GraphBuilderConfig {
  readonly tenantId: string;
  readonly namespace: string;
  readonly refreshMs: number;
  readonly tags: readonly string[];
}

export interface HorizonGraphTimeline {
  readonly stages: readonly PluginStage[];
  readonly labels: readonly StageLabel<PluginStage>[];
  readonly paths: readonly string[];
}

const nowMs = (): TimeMs => Date.now() as TimeMs;
const asTime = (value: number): TimeMs => (Number.isFinite(value) ? (value as TimeMs) : (0 as TimeMs));
const toNodeId = (value: string): HorizonNodeId => value as HorizonNodeId;
const toEdgeId = (value: string): HorizonEdgeId => value as HorizonEdgeId;
const asNum = (value: number): number => (Number.isFinite(value) ? value : 0);
const asNodeWeight = (value: number): NodeWeight => asNum(value) as NodeWeight;
const asEdgeWeight = (value: number): EdgeWeight => asNum(value) as EdgeWeight;
const toLabel = <T extends PluginStage>(stage: T): StageLabel<T> => `${stage.toUpperCase()}_STAGE` as StageLabel<T>;
const toRoute = <T extends PluginStage>(stage: T, order: number): StageRoute<T> => `${stage}::${order}` as StageRoute<T>;

export type GraphLifecycleStageTuple<T extends readonly PluginStage[]> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends PluginStage
    ? readonly [Head, ...GraphLifecycleStageTuple<Tail extends readonly PluginStage[] ? Tail : []>]
    : readonly []
  : readonly [];

export interface GraphBuildSummary {
  readonly ordered: readonly HorizonGraphNode[];
  readonly byStage: Record<PluginStage, number>;
  readonly totalWeight: number;
}

const nodeSeed = <
  TKind extends PluginStage,
  TPayload = JsonLike,
>(tenantId: string, namespace: string, stage: TKind, order: number, payload: TPayload): HorizonGraphNode<TKind, TPayload> => {
  const now = nowMs();
  return {
    id: toNodeId(`${tenantId}:${namespace}:${order}:${stage}`),
    stage,
    label: toLabel(stage),
    path: toRoute(stage, order),
    createdAt: now,
    outputAt: asTime(Number(now) + order * 2),
    weight: asNodeWeight(100 + order * 7),
    dependencies: [],
    payload,
  } satisfies HorizonGraphNode<TKind, TPayload>;
};

const pluginPath = <T extends readonly PluginStage[]>(stages: readonly [...T]): HorizonStagePath<T> => {
  const mapped = stages.map((stage, index) => toRoute(stage, index));
  return mapped as unknown as HorizonStagePath<T>;
};

export class HorizonLifecycleGraph {
  readonly #nodes = new Map<HorizonNodeId, HorizonGraphNode<PluginStage, JsonLike>>();
  readonly #edges = new Map<HorizonEdgeId, HorizonGraphEdge<PluginStage, PluginStage>>();

  readonly timeline: HorizonGraphTimeline;
  readonly pathMap: HorizonStagePath<StageWindow>;

  constructor(
    private readonly config: GraphBuilderConfig,
    private readonly stages: StageWindow,
  ) {
    const built = this.stages.map((stage, index) =>
      nodeSeed(
        this.config.tenantId,
        this.config.namespace,
        stage,
        index,
        {
          namespace: this.config.namespace,
          tenantId: this.config.tenantId,
          stage,
          order: index,
        } as const,
      ),
    );
    for (const node of built) {
      this.#nodes.set(node.id, node);
    }
    for (let index = 1; index < built.length; index += 1) {
      const previous = built[index - 1];
      const current = built[index];
      if (previous && current) {
        this.#edges.set(toEdgeId(`${previous.id}=>${current.id}`), {
          id: toEdgeId(`${previous.id}=>${current.id}`),
          from: previous.id,
          to: current.id,
          fromStage: previous.stage,
          toStage: current.stage,
          weight: asEdgeWeight(5 + index),
          reason: `${previous.stage}->${current.stage}`,
        });
      }
    }

    const ordered = [...this.#nodes.values()].sort((left, right) => Number(left.outputAt) - Number(right.outputAt));
    this.timeline = {
      stages: ordered.map((node) => node.stage),
      labels: ordered.map((node) => node.label),
      paths: ordered.map((node) => node.path),
    };
    this.pathMap = pluginPath(this.stages);
  }

  addNode<TKind extends PluginStage, TPayload>(input: {
    stage: TKind;
    stageOrder: number;
    payload: TPayload;
    dependencies?: readonly HorizonNodeId[];
    weight?: number;
  }): HorizonGraphNode<TKind, TPayload> {
    const node = nodeSeed(
      this.config.tenantId,
      this.config.namespace,
      input.stage,
      input.stageOrder,
      input.payload,
    );

    const merged: HorizonGraphNode<TKind, TPayload> = {
      ...node,
      dependencies: [...(input.dependencies ?? [])],
      weight: asNodeWeight(input.weight ?? Number(node.weight)),
    };

    if (this.#nodes.has(merged.id)) {
      throw new Error(`duplicate node ${merged.id}`);
    }

    this.#nodes.set(merged.id, merged as HorizonGraphNode<PluginStage, JsonLike>);
    return merged;
  }

  addEdge<TFrom extends PluginStage, TTo extends PluginStage>(
    from: HorizonNodeId,
    to: HorizonNodeId,
    fromStage: TFrom,
    toStage: TTo,
    reason: string,
  ): HorizonGraphEdge<TFrom, TTo> {
    if (!this.#nodes.has(from) || !this.#nodes.has(to)) {
      throw new Error(`invalid edge ${from} -> ${to}`);
    }

    const edge: HorizonGraphEdge<TFrom, TTo> = {
      id: toEdgeId(`edge:${from}:${to}`),
      from,
      to,
      fromStage,
      toStage,
      weight: asEdgeWeight(60),
      reason,
    };

    this.#edges.set(edge.id, edge as HorizonGraphEdge<PluginStage, PluginStage>);
    return edge;
  }

  get nodes(): readonly HorizonGraphNode<PluginStage, JsonLike>[] {
    return [...this.#nodes.values()];
  }

  get edges(): readonly HorizonGraphEdge[] {
    return [...this.#edges.values()];
  }

  get summary(): GraphBuildSummary {
    const byStage = this.nodes.reduce<Record<PluginStage, number>>(
      (acc, node) => {
        acc[node.stage] = (acc[node.stage] ?? 0) + 1;
        return acc;
      },
      {
        ingest: 0,
        analyze: 0,
        resolve: 0,
        optimize: 0,
        execute: 0,
      },
    );

    const ordered = [...this.nodes].sort((left, right) => Number(left.outputAt) - Number(right.outputAt));
    const totalWeight = ordered.reduce<number>((acc, node) => acc + Number(node.weight), 0);

    return {
      ordered,
      byStage,
      totalWeight,
    };
  }

  toPlan(): HorizonPlan {
    const first = this.nodes.at(0)?.stage ?? 'ingest';
    return {
      id: horizonBrand.fromPlanId(`plan:${this.config.tenantId}:${this.config.namespace}:${Date.now()}`),
      tenantId: this.config.tenantId,
      startedAt: nowMs(),
      pluginSpan: {
        stage: first,
        label: toLabel(first),
        startedAt: nowMs(),
        durationMs: horizonBrand.fromTime(Math.max(20, this.nodes.length * 12)),
      },
      payload: {
        namespace: this.config.namespace,
        tags: this.config.tags,
        stages: this.timeline.stages,
        nodes: this.nodes.map((node) => ({
          id: node.id,
          stage: node.stage,
          path: node.path,
          payload: node.payload,
        })),
        edges: this.edges.map((edge) => ({
          from: edge.from,
          to: edge.to,
          fromStage: edge.fromStage,
          toStage: edge.toStage,
        })),
      },
    };
  }

  toSnapshot(planId: PlanId): HorizonGraphSnapshot {
    return {
      tenantId: this.config.tenantId,
      planId,
      nodeCount: this.nodes.length,
      edgeCount: this.edges.length,
      nodes: this.nodes,
      edges: this.edges,
    };
  }
}

export const buildLifecycleGraph = (config: GraphBuilderConfig, stages: StageWindow): HorizonLifecycleGraph => {
  return new HorizonLifecycleGraph(config, stages);
};

export const toNodeRecord = <TRuntime extends readonly HorizonGraphNode[]>(
  nodes: NoInfer<TRuntime>,
): NodeIndexMap<TRuntime> => {
  const lookup = new Map<HorizonNodeId, TRuntime[number]>();
  for (const node of nodes) {
    lookup.set(node.id, node);
  }
  return lookup;
};

export class GraphScope implements AsyncDisposable {
  #closed = false;

  constructor(private readonly graph: HorizonLifecycleGraph) {
    void graph;
  }

  [Symbol.asyncDispose](): Promise<void> {
    this.#closed = true;
    return Promise.resolve();
  }

  [Symbol.dispose](): void {
    this.#closed = true;
  }

  snapshot(): HorizonGraphSnapshot {
    if (this.#closed) {
      throw new Error('graph scope closed');
    }
    return this.graph.toSnapshot(
      horizonBrand.fromPlanId(`snapshot:${this.graph.timeline.stages.join(',')}`),
    );
  }
}

export const withHorizonGraph = async <T>(
  config: GraphBuilderConfig,
  stages: StageWindow,
  callback: (graph: HorizonLifecycleGraph) => Promise<T> | T,
): Promise<T> => {
  const graph = buildLifecycleGraph(config, stages);
  using _scope = new GraphScope(graph);
  return callback(graph);
};
