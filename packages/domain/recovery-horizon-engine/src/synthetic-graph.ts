import { z } from 'zod';
import {
  type HorizonPlan,
  type HorizonSignal,
  type HorizonInput,
  type HorizonTenant,
  type PluginConfig,
  type PluginContract,
  type PluginStage,
  type RunId,
  type TimeMs,
  type TimeMs as TimeMsType,
  horizonBrand,
} from './types.js';

export type NodeWeight = `${number}::${string}`;

export type SyntheticStageRoute<T extends readonly PluginStage[]> = T[number] extends infer Stage
  ? Stage extends PluginStage
    ? `${Stage}${'>'}${Stage}` | Stage
    : never
  : never;

export type NodeId<TKind extends string = string> = `${TKind}:${number}`;

export interface NodePayload<TKind extends string, TData> {
  readonly id: NodeId<TKind>;
  readonly kind: TKind;
  readonly data: TData;
}

export interface GraphNode<TKind extends PluginStage, TState> {
  readonly id: NodeId<TKind>;
  readonly kind: TKind;
  readonly state: TState;
  readonly weight: NodeWeight;
}

export interface GraphEdge<TKind extends string> {
  readonly from: NodeId<TKind>;
  readonly to: NodeId<TKind>;
  readonly label: `${TKind}:to:${TKind}`;
}

export type NodeMap<TState extends Record<string, unknown>> = {
  [K in keyof TState as K extends string ? `node:${K}` : never]: TState[K];
};

export type FlattenRoute<T extends readonly string[]> = T extends readonly [infer Head, ...infer Rest]
  ? Head extends string
    ? Rest extends readonly string[]
      ? Rest extends []
        ? Head
        : `${Head}/${FlattenRoute<Rest & readonly string[] >}`
      : Head
    : never
  : never;

export interface SyntheticNodeInput<TPayload> {
  readonly tenant: HorizonTenant;
  readonly runId: RunId;
  readonly payload: TPayload;
}

export interface SyntheticNodeRuntime<TPayload, TOutput> {
  resolve(input: SyntheticNodeInput<TPayload>): Promise<TOutput>;
  readonly fallback?: (input: SyntheticNodeInput<TPayload>) => TOutput;
  dispose(): void;
}

export type SyntheticGraphNode<TPayload = unknown, TOutput = unknown> = {
  readonly node: GraphNode<PluginStage, TPayload>;
  readonly runtime: SyntheticNodeRuntime<TPayload, TOutput>;
};

export type SyntheticGraphMap<TNodes extends readonly SyntheticGraphNode[]> = {
  [N in TNodes[number] as N['node']['id']]: N;
};

export type StageConstraint<T extends PluginStage> =
  | { readonly stage: T; readonly required: false; readonly reason?: never }
  | { readonly stage: T; readonly required: true; readonly reason: `must:${T}` };

export interface SyntheticGraphSchema {
  readonly planName: string;
  readonly tenantId: string;
  readonly nodes: readonly { readonly id: string; readonly kind: PluginStage }[];
  readonly edges: readonly { readonly from: string; readonly to: string }[];
}

const graphSchema = z.object({
  planName: z.string().min(1).max(80),
  tenantId: z.string().min(3).max(120),
  nodes: z
    .array(
      z.object({
        id: z.string().min(1),
        kind: z.enum(['ingest', 'analyze', 'resolve', 'optimize', 'execute']),
      }),
    )
    .min(1),
  edges: z
    .array(
      z.object({
        from: z.string().min(1),
        to: z.string().min(1),
      }),
    )
    .min(0),
});

export const parseSyntheticGraphSchema = (value: unknown): SyntheticGraphSchema => graphSchema.parse(value);

export interface GraphSnapshot<TInput, TOutput> {
  readonly runId: RunId;
  readonly startedAt: TimeMs;
  readonly input: TInput;
  readonly output: TOutput;
}

export interface GraphTimeline<T extends readonly PluginStage[]> {
  readonly stages: T;
  readonly ordered: readonly NodeId<PluginStage>[];
  readonly events: readonly string[];
}

export interface SyntheticGraphInput<TInput> {
  readonly tenant: HorizonTenant;
  readonly runId: RunId;
  readonly payload: TInput;
}

export class SyntheticGraph<
  TNodes extends readonly SyntheticGraphNode[],
  TEdges extends readonly GraphEdge<PluginStage>[],
> {
  readonly #nodes: TNodes;
  readonly #edges: TEdges;

  constructor(nodes: TNodes, edges: TEdges) {
    this.#nodes = nodes;
    this.#edges = edges;
  }

  get nodes(): TNodes {
    return this.#nodes;
  }

  get edges(): TEdges {
    return this.#edges;
  }

  mapNodes<TMapped>(
    mapper: <
      const TNode extends TNodes[number],
      const TIndex extends number,
    >(node: TNode, index: TIndex) => TMapped,
  ): readonly TMapped[] {
    const out: TMapped[] = [];
    for (let index = 0; index < this.#nodes.length; index += 1) {
      const node = this.#nodes[index];
      if (node) {
        out.push(mapper(node, index));
      }
    }
    return out;
  }

  outDegree(): Readonly<Record<string, number>> {
    const counts = Object.fromEntries(this.#nodes.map((node) => [node.node.id, 0])) as Record<string, number>;
    for (const edge of this.#edges) {
      counts[edge.from] = (counts[edge.from] ?? 0) + 1;
    }
    return counts;
  }

  inDegree(): Readonly<Record<string, number>> {
    const counts = Object.fromEntries(this.#nodes.map((node) => [node.node.id, 0])) as Record<string, number>;
    for (const edge of this.#edges) {
      counts[edge.to] = (counts[edge.to] ?? 0) + 1;
      counts[edge.from] = counts[edge.from] ?? 0;
    }
    return counts;
  }

  topo(): readonly NodeId<PluginStage>[] {
    const degree = { ...this.inDegree() };
    const adjacency = new Map<string, string[]>();

    for (const edge of this.#edges) {
      const current = adjacency.get(edge.from) ?? [];
      current.push(edge.to);
      adjacency.set(edge.from, current);
    }

    const queue = Object.entries(degree)
      .filter(([, value]) => value === 0)
      .map(([node]) => node);
    const ordered: string[] = [];

    while (queue.length > 0) {
      const nodeId = queue.shift();
      if (!nodeId) {
        break;
      }
      ordered.push(nodeId);
      for (const next of adjacency.get(nodeId) ?? []) {
        const nextDegree = (degree[next] ?? 0) - 1;
        degree[next] = nextDegree;
        if (nextDegree === 0) {
          queue.push(next);
        }
      }
    }

    if (ordered.length !== this.#nodes.length) {
      throw new Error('synthetic graph contains cycle');
    }

    return ordered as readonly NodeId<PluginStage>[];
  }

  async execute<TInitial extends Record<string, unknown>>(
    input: SyntheticNodeInput<TInitial>,
    options?: {
      readonly filter?: (node: TNodes[number]) => boolean;
      readonly onRun?: (nodeId: string, stage: PluginStage, elapsedMs: number) => void;
      readonly signal?: AbortSignal;
    },
  ): Promise<{
    readonly snapshots: readonly GraphSnapshot<TInitial, unknown>[];
    readonly timeline: GraphTimeline<readonly PluginStage[]>;
  }> {
    const signal = options?.signal;
    const signalOrder = this.topo();
    const events: string[] = [];

    const mapById = new Map<string, TNodes[number]>();
    for (const node of this.#nodes) {
      mapById.set(node.node.id, node);
    }

    const snapshots: GraphSnapshot<TInitial, unknown>[] = [];
    const ordered: NodeId<PluginStage>[] = [];
    const runtimeState = {} as Record<string, unknown>;

    for (const nodeId of signalOrder) {
      if (signal?.aborted) {
        throw new Error('execution aborted');
      }

      const node = mapById.get(nodeId);
      if (!node || options?.filter?.(node) === false) {
        continue;
      }

      const startedAt = Date.now() as TimeMs;
      let value: unknown;
      try {
        value = await node.runtime.resolve({
          tenant: input.tenant,
          runId: input.runId,
          payload: input.payload as never,
        });
      } catch {
        value = node.runtime.fallback?.({
          tenant: input.tenant,
          runId: input.runId,
          payload: input.payload as never,
        }) ?? {};
      }

      ordered.push(nodeId);
      runtimeState[node.node.id] = value;
      options?.onRun?.(nodeId, node.node.kind, Number(Date.now() - startedAt));
      events.push(`${nodeId}:${node.node.kind}`);
      snapshots.push({ runId: input.runId, startedAt, input: input.payload, output: value });
    }

    return {
      snapshots,
      timeline: {
        stages: ordered.map((entry) => {
          const match = this.#nodes.find((candidate) => candidate.node.id === entry);
          return (match?.node.kind ?? 'ingest') as PluginStage;
        }),
        ordered,
        events,
      },
    };
  }

  static fromSignals(
    tenant: HorizonTenant,
    runId: RunId,
    contracts: readonly PluginContract<PluginStage, PluginConfig<PluginStage, unknown>, unknown>[],
  ): SyntheticGraph<
    readonly SyntheticGraphNode<unknown, unknown>[],
    readonly []
  > {
    const nodes = contracts.map((entry, index) => ({
      node: {
        id: `${runId}:${entry.kind}:${index}` as NodeId<PluginStage>,
        kind: entry.kind,
        state: {
          tenant,
          runId,
          contract: entry.id,
        },
        weight: `${index}::${entry.kind}` as NodeWeight,
      },
      runtime: {
        resolve: async (runtimeInput: SyntheticNodeInput<unknown>): Promise<unknown> => {
          const emitted = await entry.execute([entry.defaults as PluginConfig<PluginStage, unknown>], new AbortController().signal);
          const primary = emitted[0];
          if (primary) {
            return {
              stage: entry.kind,
              contract: entry.id,
              tenant: runtimeInput.tenant,
              runId: runtimeInput.runId,
              selected: primary,
              runPayload: runtimeInput.payload,
            };
          }
          return {
            stage: entry.kind,
            contract: entry.id,
            tenant: runtimeInput.tenant,
            runId: runtimeInput.runId,
            fallback: true,
            runPayload: runtimeInput.payload,
          };
        },
        fallback: (runtimeInput: SyntheticNodeInput<unknown>) => ({
          stage: entry.kind,
          contract: entry.id,
          tenant: runtimeInput.tenant,
          runId: runtimeInput.runId,
          fallback: true,
          runPayload: runtimeInput.payload,
        }),
        dispose: () => void 0,
      },
    }));

    return new SyntheticGraph(nodes, [] as const);
  }
}

export const createPlanFromTemplate = <
  TTemplate extends { readonly tenant: HorizonTenant; readonly version: string },
>(
  template: TTemplate,
  stageWindow: readonly PluginStage[],
): HorizonPlan => {
  const first = stageWindow[0] ?? 'ingest';
  return {
    id: horizonBrand.fromPlanId(`plan:${template.tenant}:${template.version}:${Date.now()}`),
    tenantId: template.tenant,
    startedAt: Date.now() as TimeMs,
    pluginSpan: {
      stage: first,
      label: `${first.toUpperCase()}_STAGE` as `${Uppercase<typeof first>}_STAGE`,
      startedAt: Date.now() as TimeMsType,
      durationMs: horizonBrand.fromTime(0),
    },
    payload: {
      stageWindow,
      template,
    },
  };
};

export const buildGraphFromContracts = (
  contracts: readonly PluginContract<PluginStage, PluginConfig<PluginStage, unknown>, unknown>[],
): SyntheticGraph<readonly SyntheticGraphNode[], readonly []> => SyntheticGraph.fromSignals(
  'tenant-001' as HorizonTenant,
  horizonBrand.fromRunId('seed'),
  contracts,
);

export type SplitPath<T extends string> = T extends `${infer Head}/${infer Tail}`
  ? [Head, ...SplitPath<Tail>]
  : [T];

export const routeFromPath = <T extends string>(path: T): FlattenRoute<SplitPath<T>> => {
  return path.split('/') as FlattenRoute<SplitPath<T>>;
};

export const normalizeSignal = <
  const TSignal extends HorizonSignal<PluginStage, unknown>,
>(
  signal: TSignal,
): {
  readonly route: FlattenRoute<SplitPath<TSignal['kind'] & string>>;
  readonly payload: unknown;
} => {
  const raw = signal.kind.includes('_')
    ? `${signal.kind.replace('_STAGE', '').toLowerCase()}`.split('_') as readonly string[]
    : [signal.kind.toLowerCase()];
  return {
    route: raw as FlattenRoute<SplitPath<TSignal['kind'] & string>>,
    payload: signal.payload,
  };
};

export const pickSignalsByStage = <
  const TSignals extends readonly HorizonSignal<PluginStage, unknown>[],
>(
  signals: TSignals,
  stage: TSignals[number]['kind'],
): readonly {
  readonly signal: TSignals[number];
  readonly route: FlattenRoute<SplitPath<TSignals[number]['kind'] & string>>;
}[] => {
  return signals
    .filter((signal) => signal.kind === stage)
    .map((signal) => ({
      signal,
      route: routeFromPath(signal.kind as TSignals[number]['kind'] & string),
    }));
};

export const collectContractByStage = <
  const TContracts extends readonly PluginContract<PluginStage, PluginConfig<PluginStage, unknown>, unknown>[],
>(
  contracts: TContracts,
) =>
  contracts.reduce<Record<PluginStage, TContracts[number][]>>((acc, contract) => {
    const bucket = acc[contract.kind] ?? [];
    acc[contract.kind] = [...bucket, contract];
    return acc;
  }, {
    ingest: [],
    analyze: [],
    resolve: [],
    optimize: [],
    execute: [],
  } as Record<PluginStage, TContracts[number][]>);

export const collectRunSignals = <T extends readonly HorizonSignal<PluginStage, unknown>[]>(
  _plan: HorizonPlan,
  stage: PluginStage,
  payload: T,
): readonly HorizonSignal<PluginStage, unknown>[] => {
  return payload.filter((signal) => signal.kind === stage);
};

export const collectConstraints = <
  const TStages extends readonly PluginStage[],
>(
  stages: TStages,
): readonly StageConstraint<TStages[number]>[] =>
  stages.map((stage) =>
    stage === stages[0]
      ? { stage, required: true, reason: `must:${stage}` }
      : { stage, required: true, reason: `must:${stage}` as const },
  );

export const mergeConstraints = <
  const TLeft extends readonly StageConstraint<PluginStage>[],
  const TRight extends readonly StageConstraint<PluginStage>[],
>(
  left: TLeft,
  right: TRight,
): readonly [...TLeft, ...TRight] => {
  return [...left, ...right];
};

export const extractContractIds = <
  const TContracts extends readonly PluginContract<PluginStage, PluginConfig<PluginStage, unknown>, unknown>[],
>(contracts: TContracts): readonly string[] => {
  return contracts.map((contract) => `${contract.kind}-${String(contract.id)}`);
};

export const collectKinds = <
  const TContracts extends readonly PluginContract<PluginStage, PluginConfig<PluginStage, unknown>, unknown>[],
>(contracts: TContracts): PluginStage[] => {
  const seen = new Set<PluginStage>();
  for (const contract of contracts) {
    seen.add(contract.kind);
  }
  return [...seen];
};

export const toHorizonPlanInput = <TKind extends PluginStage, TPayload>(
  signal: HorizonSignal<TKind, TPayload>,
): HorizonInput<TKind> => ({
  version: '1.0.0',
  runId: signal.input.runId,
  tenantId: signal.input.tenantId,
  stage: signal.input.stage as TKind,
  tags: signal.input.tags,
  metadata: signal.input.metadata,
});
