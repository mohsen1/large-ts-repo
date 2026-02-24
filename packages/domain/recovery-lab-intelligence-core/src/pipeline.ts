import type {
  StrategyContext,
  StrategyMode,
  StrategyLane,
  WorkspaceId,
  SessionId,
  RunId,
  PlanId,
  ScenarioId,
  StrategyResult,
  SignalEvent,
  PluginFingerprint,
  PluginId,
} from './types';
import type { PluginExecutionRecord } from './contracts';

export type PipelineNode<I, O, C = unknown> = (input: I, context: StrategyContext<C>) => Promise<O>;

export type PipelineTuple<
  TInput,
  TTransforms extends readonly PipelineNode<any, any, any>[],
> = TTransforms extends readonly [infer Head extends PipelineNode<TInput, any, any>, ...infer Tail extends readonly PipelineNode<any, any, any>[]]
  ? readonly [Head, ...PipelineTuple<TInput, Tail>]
  : readonly [];

type ExpandPipeline<
  TInput,
  TTransforms extends readonly PipelineNode<any, any, any>[],
> = TTransforms extends readonly [infer Head extends PipelineNode<TInput, infer Output, any>, ...infer Tail extends readonly PipelineNode<any, any, any>[]]
  ? Output | ExpandPipeline<Output, Tail>
  : TInput;

export type PipelineOutput<
  TInput,
  TTransforms extends readonly PipelineNode<any, any, any>[],
> = ExpandPipeline<TInput, TTransforms>;

export type VariadicPipeline<
  TInput,
  TTransforms extends readonly PipelineNode<any, any, any>[],
> = (input: TInput, context: StrategyContext<unknown>) => Promise<PipelineOutput<TInput, TTransforms>>;

type PipelineMetadata = {
  readonly workspace: string;
  readonly route: string;
  readonly tuple: readonly [unknown, ...readonly unknown[]];
};

const makePhaseRoute = (mode: StrategyMode, lane: StrategyLane, index: number): string => `${mode}:${lane}:${index}`;
const normalizeTuple = (tuple: readonly [string, string, string, number]): readonly [string, string, string, number] => tuple;
const nowStamp = (): string => new Date().toISOString();

export interface PipelineSnapshot<TInput = unknown> {
  readonly route: string;
  readonly stage: StrategyMode;
  readonly phase: number;
  readonly payload: TInput;
}

export class PipelineRunner<TInput, TContext = unknown> {
  readonly #nodes: readonly PipelineNode<any, any, any>[];
  readonly #tuple: readonly [StrategyMode, StrategyLane, string, number];
  readonly #contextFactory: (seed: TInput) => StrategyContext<TContext>;
  #phase = 0;
  readonly #metadata: PipelineMetadata;

  constructor(
    tuple: readonly [StrategyMode, StrategyLane, string, number],
    contextFactory: (seed: TInput) => StrategyContext<TContext>,
    nodes: readonly PipelineNode<any, any, any>[],
  ) {
    this.#tuple = normalizeTuple(tuple) as [StrategyMode, StrategyLane, string, number];
    this.#contextFactory = contextFactory;
    this.#nodes = [...nodes];
    this.#metadata = {
      workspace: `workspace:${nowStamp()}`,
      route: `pipeline:${this.#tuple[0]}`,
      tuple: this.#tuple,
    };
  }

  get stageCount() {
    return this.#nodes.length;
  }

  snapshots(): readonly PipelineSnapshot<TInput>[] {
    const route = makePhaseRoute(this.#tuple[0], this.#tuple[1], this.#phase);
    return [{ route, stage: this.#tuple[0], phase: this.#phase, payload: {} as TInput }];
  }

  async execute(
    seed: TInput,
    context: StrategyContext<TContext>,
    onProgress?: (snapshot: PipelineSnapshot<TInput>, current: number, total: number) => void,
  ): Promise<{
    readonly value: PipelineOutput<TInput, readonly PipelineNode<any, any, any>[]>;
    readonly traces: readonly PluginExecutionRecord<
      unknown,
      PipelineOutput<TInput, readonly PipelineNode<any, any, any>[]>
    >[];
  }> {
    const localContext = this.#contextFactory(seed);
    let current: unknown = seed;
    const traces: PluginExecutionRecord<
      unknown,
      PipelineOutput<TInput, readonly PipelineNode<any, any, any>[]>
    >[] = [];
    const stages = this.#nodes.length;
    const mergedContext = {
      ...context,
      ...localContext,
      baggage: {
        ...context.baggage,
        ...localContext.baggage,
      },
    };

    for (const [index, node] of this.#nodes.entries()) {
      const startedAt = nowStamp();
      const route = makePhaseRoute(this.#tuple[0], this.#tuple[1], index);
      onProgress?.({ route, stage: this.#tuple[0], phase: index, payload: current as TInput }, index, stages);
      const attemptStart = typeof performance?.now === 'function' ? performance.now() : Date.now();
      try {
        current = await node(current, mergedContext);
        const consumedMs = Math.round((typeof performance?.now === 'function' ? performance.now() : Date.now()) - attemptStart);
        traces.push({
          traceId: `${context.runId}:${route}` as PluginId,
          phase: this.#tuple[0],
          startedAt,
          completedAt: nowStamp(),
          input: current,
          output: current as PipelineOutput<TInput, readonly PipelineNode<any, any, any>[]>,
          diagnostics: this.buildDiagnostics(route, consumedMs, false),
          context: mergedContext,
        });
      } catch (error) {
        const consumedMs = Math.round((typeof performance?.now === 'function' ? performance.now() : Date.now()) - attemptStart);
        traces.push({
          traceId: `${context.runId}:${route}` as PluginId,
          phase: this.#tuple[0],
          startedAt,
          completedAt: nowStamp(),
          input: current,
          output: undefined,
          diagnostics: this.buildDiagnostics(route, consumedMs, true, error),
          context: mergedContext,
        });
        throw error;
      }
    }

    this.#phase = this.#nodes.length;
    return {
      value: current as PipelineOutput<TInput, readonly PipelineNode<any, any, any>[]>,
      traces,
    };
  }

  get metadata() {
    return {
      ...this.#metadata,
    };
  }

  private buildDiagnostics(
    route: string,
    consumedMs: number,
    error: boolean,
    cause?: unknown,
  ): readonly SignalEvent[] {
    return [
      {
        source: 'orchestration',
        severity: error ? 'error' : 'info',
        at: nowStamp(),
        detail: {
          route,
          consumedMs,
          cause: cause ? String(cause) : undefined,
          phase: this.#phase,
        },
      },
    ];
  }
}

export const createPipeline = <
  const TInput,
  const TTransforms extends readonly PipelineNode<TInput, any, any>[],
>(
  tuple: readonly [StrategyMode, StrategyLane, string, number],
  contextFactory: (seed: TInput) => StrategyContext,
  ...stages: TTransforms
): VariadicPipeline<TInput, TTransforms> => {
  const runner = new PipelineRunner<TInput, unknown>(tuple as [StrategyMode, StrategyLane, string, number], contextFactory, stages);
  return (async (seed, context) => {
    const result = await runner.execute(seed, context);
    return result.value;
  }) as VariadicPipeline<TInput, TTransforms>;
};

export const composeTransforms = <
  TInput,
  TTransforms extends readonly PipelineNode<any, any, any>[],
>(
  ...stages: TTransforms
): PipelineTuple<TInput, TTransforms> => stages as unknown as PipelineTuple<TInput, TTransforms>;

export const executePipeline = async <
  TInput,
  TTransforms extends readonly PipelineNode<any, any, any>[],
>(
  input: TInput,
  context: StrategyContext,
  stages: TTransforms,
): Promise<PipelineOutput<TInput, TTransforms>> => {
  let current: unknown = input;
  for (const stage of stages as readonly PipelineNode<any, any, any>[]) {
    current = await stage(current, context);
  }
  return current as PipelineOutput<TInput, TTransforms>;
};

export const summarizePipeline = (
  tuple: readonly [StrategyMode, StrategyLane, string, number],
  context: StrategyContext,
): {
  readonly route: string;
  readonly workspace: WorkspaceId;
  readonly runId: RunId;
  readonly sessionId: SessionId;
  readonly planId: PlanId;
  readonly scenario: ScenarioId;
  readonly fingerprint: PluginFingerprint;
} => {
  const [mode, lane] = tuple;
  return {
    route: makePhaseRoute(mode, lane, tuple[3] ?? 0),
    workspace: context.workspace,
    runId: context.runId,
    sessionId: context.sessionId,
    planId: context.planId,
    scenario: context.scenario,
    fingerprint: `${mode}:${lane}:${context.sessionId}` as PluginFingerprint,
  };
};
