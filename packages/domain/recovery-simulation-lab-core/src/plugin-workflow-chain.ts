import type { NoInfer } from '@shared/type-level';
import { createDisposableScope } from '@shared/recovery-lab-kernel';
import type { Brand } from '@shared/core';
import { withBrand } from '@shared/core';
import type { LabExecution, LabExecutionResult, LabLane, LabScenario } from './models';

export type WorkflowLane = 'bootstrap' | 'prepare' | 'dispatch' | 'execute' | 'summarize' | 'audit';
export type WorkflowRouteScope<T extends string = string> = T extends `${infer Prefix}-${infer Suffix}`
  ? `${Prefix}` | `${Prefix}-${WorkflowRouteScope<Suffix>}`
  : T;

export type WorkflowTag<TLane extends WorkflowLane = WorkflowLane> = `wf:${TLane}`;
export type WorkflowSequence = readonly WorkflowLane[];
export type AnyPlugin = PluginDefinition<unknown, unknown, string>;

export type BrandedCheckpointId = Brand<string, 'CheckpointId'>;

export type PluginInputOf<TPlugin> = TPlugin extends PluginDefinition<infer TInput, any, any, any> ? TInput : never;
export type PluginOutputOf<TPlugin> = TPlugin extends PluginDefinition<any, infer TOutput, any, any> ? TOutput : never;
export type PluginLabelOf<TPlugin> = TPlugin extends PluginDefinition<any, any, infer TLabel, any> ? TLabel : never;
export type PluginLaneOf<TPlugin> = TPlugin extends PluginDefinition<any, any, any, infer TLane> ? TLane : never;

export type LastOutput<TChain extends readonly AnyPlugin[]> = TChain extends readonly [...infer _Rest, infer Tail]
  ? Tail extends PluginDefinition<any, infer TOutput, any, any>
    ? TOutput
    : never
  : never;

export interface PluginDefinition<
  TInput = unknown,
  TOutput = unknown,
  TLabel extends string = string,
  TLane extends LabLane = LabLane,
> {
  readonly id: string;
  readonly label: TLabel;
  readonly lane: TLane;
  readonly tags: readonly WorkflowTag[];
  readonly requires?: readonly string[];
  readonly config: Readonly<Record<string, unknown>>;
  readonly run: (input: NoInfer<TInput>, state: PluginRunState) => Promise<TOutput> | TOutput;
}

export interface PluginRunState {
  readonly startedAt: number;
  readonly lane: LabLane;
  readonly workspace: string;
}

export interface PluginExecution<TInput, TOutput> {
  readonly pluginId: string;
  readonly input: TInput;
  readonly output: TOutput;
  readonly elapsedMs: number;
  readonly route: readonly string[];
}

export interface RouteCheckpoint {
  readonly stage: WorkflowLane;
  readonly label: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface ChainExecution<TChain extends readonly AnyPlugin[]> {
  readonly chain: readonly AnyPlugin[];
  readonly trace: readonly string[];
  readonly outputs: readonly PluginExecution<unknown, unknown>[];
}

export interface WorkflowResult<TChain extends readonly AnyPlugin[]> {
  readonly output: LastOutput<TChain>;
  readonly chain: ChainExecution<TChain>;
  readonly score: number;
}

export interface WorkflowAudit<TInput> {
  readonly trace: readonly RouteCheckpoint[];
  readonly input: TInput;
  readonly route: WorkflowLane;
}

export type ValidChain<TChain extends readonly AnyPlugin[]> =
  TChain extends readonly []
    ? []
    : TChain extends readonly [infer Head extends AnyPlugin, ...infer Tail extends readonly AnyPlugin[]]
      ? Tail extends readonly []
        ? [Head]
        : [Head, ...ValidChain<CompatibleChain<Tail, PluginOutputOf<Head>>>]
      : never;

export type CompatibleChain<
  TChain extends readonly AnyPlugin[],
  TInput = PluginInputOf<TChain[number]>,
> = TChain extends readonly [
  infer Head extends PluginDefinition<TInput, infer TOutput, any, any>,
  ...infer Tail extends readonly AnyPlugin[],
]
  ? [Head, ...CompatibleChain<Tail, TOutput>]
  : [];

export type RemapPlugins<TPlugins extends Record<string, AnyPlugin>> = {
  [K in keyof TPlugins as K extends string ? `plugin:${K}` : never]: PluginDefinitionOf<TPlugins[K]>;
};

export type PluginDefinitionOf<TPlugin> = TPlugin extends AnyPlugin
  ? {
      readonly id: TPlugin['id'];
      readonly label: TPlugin['label'];
      readonly lane: TPlugin['lane'];
      readonly tags: TPlugin['tags'];
    }
  : never;

export const makeCheckpointId = (value: string): BrandedCheckpointId => withBrand(value, 'CheckpointId');

const defaultChain = ['bootstrap', 'prepare', 'dispatch', 'execute', 'summarize', 'audit'] as const satisfies WorkflowSequence;
const defaultStageMap = new Map<WorkflowLane, number>(
  defaultChain.map((stage, index) => [stage, index]),
);

export class PluginChain<TChain extends readonly AnyPlugin[]> {
  readonly #chain: TChain;
  readonly #route: Map<WorkflowLane, readonly string[]>;

  private constructor(chain: TChain, route: Map<WorkflowLane, readonly string[]>) {
    this.#chain = chain;
    this.#route = route;
  }

  public static create<TChain extends readonly AnyPlugin[]>(chain: TChain): PluginChain<TChain> {
    const map = new Map<WorkflowLane, readonly string[]>();

    for (const stage of defaultChain) {
      const filtered = chain
        .filter((entry) => toStageLane(entry.lane) === stage)
        .map((entry) => `${entry.id}:${entry.label}`);
      map.set(stage, filtered);
    }

    return new PluginChain(chain, map);
  }

  public withPlugin<TInput, TOutput, TLabel extends string, TLane extends LabLane>(
    plugin: PluginDefinition<TInput, TOutput, TLabel, TLane>,
  ): PluginChain<
    [...TChain, PluginDefinition<TInput, TOutput, TLabel, TLane> & AnyPlugin]
  > {
    const nextRoute = new Map(this.#route);
    const current = plugin.lane;
    const normalizedLane = toStageLane(current);
    const next = [...(this.#route.get(normalizedLane) ?? []), `${plugin.id}:${plugin.label}`] as const;
    nextRoute.set(normalizedLane, next);

    return new PluginChain(
      [...this.#chain, plugin] as [...TChain, PluginDefinition<TInput, TOutput, TLabel, TLane> & AnyPlugin],
      nextRoute,
    );
  }

  public async run<TInput>(input: NoInfer<TInput>): Promise<WorkflowResult<TChain>> {
    const checkpoints: RouteCheckpoint[] = [];
    const outputs: PluginExecution<unknown, unknown>[] = [];
    const ordered = [...this.#chain].toSorted((left, right) => {
      const leftPriority = defaultStageMap.get(toStageLane(left.lane)) ?? 99;
      const rightPriority = defaultStageMap.get(toStageLane(right.lane)) ?? 99;
      return leftPriority - rightPriority;
    });

    let cursor: unknown = input as NoInfer<TInput>;
    await using _scope = new AsyncDisposableStack();

    for (const [index, plugin] of ordered.entries()) {
      const stage = toStageLane(plugin.lane);
      const started = Date.now();
      const workspace = makeCheckpointId(`${stage}::${plugin.id}`);
      const output = await plugin.run(cursor, {
        startedAt: started,
        lane: plugin.lane,
        workspace: `${workspace}`,
      });

      outputs.push({
        pluginId: plugin.id,
        input: cursor,
        output,
        elapsedMs: Date.now() - started,
        route: this.#route.get(stage) ?? [],
      });

      checkpoints.push({
        stage,
        label: plugin.label,
        payload: {
          outputType: typeof output,
          route: this.#route.get(stage)?.join('|') ?? '',
          touchpoint: index,
        },
      });

      cursor = output;
    }

    const orderedRoute = ordered.map((plugin) => plugin.id);
    const orderedOutputs = ordered;
    return {
      output: cursor as LastOutput<TChain>,
      chain: {
        chain: this.#chain as readonly AnyPlugin[],
        trace: orderedRoute,
        outputs,
      },
      score: ordered.length === 0 ? 0 : Number((1 / ordered.length).toFixed(2)),
    };
  }

  public get route(): ReadonlyMap<WorkflowLane, readonly string[]> {
    return this.#route;
  }

  public listPlugins(): readonly AnyPlugin[] {
    return [...this.#chain];
  }

  public [Symbol.asyncDispose](): Promise<void> {
    return Promise.resolve();
  }
}

export const toStageLane = (lane: LabLane): WorkflowLane => {
  if (lane === 'ingest') {
    return 'bootstrap';
  }
  if (lane === 'simulate') {
    return 'prepare';
  }
  if (lane === 'verify') {
    return 'dispatch';
  }
  if (lane === 'restore') {
    return 'execute';
  }
  return 'audit';
};

export const toWorkflowTag = (lane: LabLane, mode?: string): WorkflowTag => {
  const resolved = toStageLane(lane);
  return `wf:${mode ?? resolved}` as WorkflowTag;
};

export const buildWorkflowTag = (lane: LabLane, index: number): WorkflowTag<WorkflowLane> =>
  `wf:${toStageLane(lane)}:${index}` as WorkflowTag<WorkflowLane>;

export const buildWorkflowChain = <
  TChain extends readonly AnyPlugin[],
  TInput,
>(plugins: TChain, _seed: NoInfer<TInput>): PluginChain<readonly [...TChain]> => {
  const chain = PluginChain.create(plugins);
  void _seed;
  return chain as PluginChain<readonly [...TChain]>;
};

export const routeTrace = <TChain extends readonly AnyPlugin[]>(chain: PluginChain<TChain>): readonly string[] => {
  return chain.listPlugins().flatMap((entry) => [entry.id, entry.label]);
};

export const renderChainTemplate = async <TChain extends readonly AnyPlugin[]>(chain: PluginChain<TChain>): Promise<string> => {
  const scope = createDisposableScope();
  await using _scope = scope;
  const rows = chain.listPlugins().map((plugin) => `${plugin.id}::${plugin.lane}`);
  return rows.toSorted().join('|');
};

export const routeScopeFromScenario = async (scenario: LabScenario): Promise<WorkflowRouteScope> => {
  const scope = `${scenario.tenant}/${scenario.scenarioId}`;
  return await Promise.resolve(scope as WorkflowRouteScope);
};

export const routeExecutionFromChain = <
  TChain extends readonly AnyPlugin[],
>(chain: PluginChain<TChain>, execution: LabExecution): readonly string[] => {
  const checkpoints = routeTrace(chain);
  return checkpoints.map((entry) => `${execution.executionId}:${entry}`);
};

export const summarizeExecution = (execution: LabExecutionResult): WorkflowAudit<LabExecution> => {
  const summary = [...execution.steps].toSorted((left, right) => right.score - left.score);
  return {
    trace: summary
      .map((step, index) => ({
        stage: defaultChain[index % defaultChain.length] ?? 'audit',
        label: `${step.status}:${step.score.toFixed(2)}`,
        payload: {
          message: step.message,
          status: step.status,
          touchpoint: index,
        },
      }))
      .toSorted((left, right) => right.payload.touchpoint - left.payload.touchpoint),
    input: execution.execution,
    route: defaultChain[summary.length % defaultChain.length] ?? 'audit',
  };
};
