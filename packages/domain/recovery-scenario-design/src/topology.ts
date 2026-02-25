import { Brand } from '@shared/type-level';
import { createRunId, ScenarioId, ScenarioRunId, ScenarioStageId, brandMetricKey } from './identity';

export type StageStatus =
  | 'queued'
  | 'warming'
  | 'active'
  | 'paused'
  | 'completed'
  | 'failed';

export type StageKind =
  | 'ingress'
  | 'enrichment'
  | 'forecast'
  | 'mitigation'
  | 'verification'
  | 'rollback'
  | 'audit';

export type TopologyNoInfer<T> = [T][T extends never ? never : 0];

export type StagePayload<TConfig extends Record<string, unknown>, TInput, TOutput> = {
  readonly id: ScenarioStageId;
  readonly kind: StageKind;
  readonly status: StageStatus;
  readonly config: TConfig;
  readonly input: TInput;
  readonly output?: TOutput;
};

export type StageEdge<From extends ScenarioStageId, To extends ScenarioStageId> = {
  from: From;
  to: To;
  readonly weight: number & { readonly __brand: 'StageTransitionWeight' };
  readonly condition?: `when.${string}`;
};

export interface StageVertex<TContext, TConfig extends Record<string, unknown>> {
  readonly id: ScenarioStageId;
  readonly kind: StageKind;
  readonly dependsOn: readonly ScenarioStageId[];
  readonly config: TConfig;
  execute(context: Readonly<TContext>, input: unknown): Promise<unknown>;
}

export type StageGraphNode<
  TConfig extends Record<string, unknown>,
  TContext = unknown,
> = {
  readonly stage: StageVertex<TContext, TConfig>;
  readonly children: readonly StageGraphNode<TConfig, TContext>[];
};

export type BuildGraph<
  T extends readonly StageVertex<any, any>[],
  TContext = unknown,
> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends StageVertex<infer InnerContext, infer Config>
    ? [
        StageGraphNode<Config & Record<string, unknown>, TContext extends InnerContext ? InnerContext : TContext>,
        ...BuildGraph<
          Extract<Tail, readonly StageVertex<any, any>[]> & readonly StageVertex<any, any>[],
          TContext
        >,
      ]
    : []
  : [];

export type ExtractStageKind<T> = T extends StageGraphNode<any, infer C> ? C : never;

export type PathByKind<
  TNodes extends readonly { readonly kind: StageKind; readonly id: ScenarioStageId }[],
  TKind extends StageKind,
> = TNodes extends readonly [infer Head, ...infer Tail]
  ? Head extends { readonly kind: TKind; readonly id: ScenarioStageId }
    ? [Head['id'], ...PathByKind<Extract<Tail, readonly any[]>, TKind>]
    : PathByKind<Extract<Tail, readonly any[]>, TKind>
  : [];

export const stageKindRegistry = {
  ingress: { order: 0, canRunConcurrently: false },
  enrichment: { order: 1, canRunConcurrently: true },
  forecast: { order: 2, canRunConcurrently: true },
  mitigation: { order: 3, canRunConcurrently: false },
  verification: { order: 4, canRunConcurrently: true },
  rollback: { order: 5, canRunConcurrently: false },
  audit: { order: 6, canRunConcurrently: false },
} as const satisfies Record<StageKind, { readonly order: number; readonly canRunConcurrently: boolean }>;

export type StageDependencyMap = Map<ScenarioStageId, readonly ScenarioStageId[]>;

export interface TopologyMetrics {
  readonly generatedAt: number;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly density: number;
}

export interface TopologySummary {
  readonly topologyId: ScenarioRunId;
  readonly runId: ScenarioRunId;
  readonly metrics: {
    [K in StageKind]: {
      readonly count: number;
      readonly successRate: `${number}%`;
    };
  };
}

export type StageMetricsName<T extends string> = Brand<`${T}_p95`, 'ScenarioMetric'>;

export const topologyCounter = {
  build: <TConfig extends Record<string, unknown>>(nodes: readonly StageVertex<unknown, TConfig>[]) => ({
    timestamp: createRunId('topology', BigInt(nodes.length)),
    size: nodes.length,
  }),
} as const;

export class StageTopology<TContext, TConfig extends Record<string, unknown>> {
  #nodes = new Map<ScenarioStageId, StageVertex<TContext, TConfig>>();
  #edges: StageEdge<ScenarioStageId, ScenarioStageId>[] = [];

  addVertex(vertex: StageVertex<TContext, TConfig>): this {
    this.#nodes.set(vertex.id, vertex);
    return this;
  }

  addEdge(edge: StageEdge<ScenarioStageId, ScenarioStageId>): this {
    if (!this.#nodes.has(edge.from) || !this.#nodes.has(edge.to)) {
      throw new Error(`invalid edge: ${edge.from} -> ${edge.to}`);
    }
    this.#edges.push(edge);
    return this;
  }

  nodes(): readonly StageVertex<TContext, TConfig>[] {
    return [...this.#nodes.values()];
  }

  edges(): readonly StageEdge<ScenarioStageId, ScenarioStageId>[] {
    return [...this.#edges];
  }

  orderedByKind(kind: TopologyNoInfer<StageKind>): readonly StageVertex<TContext, TConfig>[] {
    return [...this.#nodes.values()].filter((node) => node.kind === kind);
  }

  findReachable(from: ScenarioStageId): readonly ScenarioStageId[] {
    const seen = new Set<ScenarioStageId>();
    const result: ScenarioStageId[] = [];
    const walk = (cursor: ScenarioStageId): void => {
      if (seen.has(cursor)) {
        return;
      }
      seen.add(cursor);
      result.push(cursor);
      for (const edge of this.#edges) {
        if (edge.from === cursor) {
          walk(edge.to);
        }
      }
    };
    walk(from);
    return result;
  }

  toDependencyMap(): StageDependencyMap {
    const map = new Map<ScenarioStageId, ScenarioStageId[]>();
    for (const node of this.#nodes.values()) {
      map.set(node.id, []);
    }
    for (const edge of this.#edges) {
      const existing = map.get(edge.to) ?? [];
      existing.push(edge.from);
      map.set(edge.to, existing);
    }
    return map;
  }

  summarize(): TopologySummary {
    const runId = topologyCounter.build([...this.#nodes.values()]).timestamp;
    const metricEntries = (Object.keys(stageKindRegistry) as StageKind[]).map((kind) => {
      const count = this.orderedByKind(kind).length;
      return [
        kind,
        {
          count,
          successRate: `${count === 0 ? 100 : Math.max(0, Math.min(100, 72 + count))}%` as `${number}%`,
        },
      ] as const;
    });
    return {
      topologyId: createRunId('scenario', BigInt(this.#edges.length + this.#nodes.size)),
      runId,
      metrics: Object.fromEntries(metricEntries) as TopologySummary['metrics'],
    };
  }
}

export function buildTopologyFromStages<
  TContext,
  TConfig extends Record<string, unknown>,
  const TStages extends readonly StageVertex<TContext, TConfig>[],
>(
  stages: TStages,
): StageTopology<TContext, TConfig> {
  const topology = new StageTopology<TContext, TConfig>();
  for (const stage of stages) {
    topology.addVertex(stage);
  }
  for (let index = 0; index < stages.length - 1; index += 1) {
    const from = stages[index]?.id;
    const to = stages[index + 1]?.id;
    if (from && to) {
      topology.addEdge({
        from,
        to,
        weight: (1 as number & { readonly __brand: 'StageTransitionWeight' }),
        condition: `when.step_${index}`,
      });
    }
  }
  return topology;
}

export type MetricToken = ReturnType<typeof brandMetricKey>;
export type TopologyNode<TContext, TConfig extends Record<string, unknown>> = StageVertex<TContext, TConfig>;
export type TopologySnapshot<TContext, TConfig extends Record<string, unknown>> = {
  readonly id: ScenarioId;
  readonly topology: StageTopology<TContext, TConfig>;
  readonly stageIds: readonly ScenarioStageId[];
  readonly metrics: StageMetricsName<`${StageKind}`>[];
};

export interface TopologyDiagnostics {
  readonly runId: ScenarioRunId;
  readonly cycleCount: number;
  readonly hotspot: StageVertex<unknown, Record<string, unknown>> | undefined;
}

export function* topologyIterator<TContext, TConfig extends Record<string, unknown>>(
  topology: StageTopology<TContext, TConfig>,
): Generator<StageVertex<TContext, TConfig>, void, undefined> {
  for (const node of topology.nodes()) {
    yield node;
  }
}

export type IteratorOutput<T> = T extends Generator<infer U, any, any> ? U : never;
