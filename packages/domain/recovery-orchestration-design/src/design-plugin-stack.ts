import { createDisposableScope } from '@shared/recovery-lab-kernel';
import { withBrand } from '@shared/core';
import type { NoInfer } from '@shared/type-level';
import type { DesignPlanId, DesignStage, DesignTenantId, PlanSignal } from './contracts';
import { type DesignPluginId, type StageAware, type StageSignalRoute, type DesignWorkspaceId } from './design-advanced-types';

export type PluginLane = 'ingest' | 'transform' | 'synthesize' | 'verify' | 'observe';

export interface DesignPluginContext {
  readonly requestId: string;
  readonly traceId: string;
  readonly tenant: DesignTenantId;
  readonly workspace: DesignWorkspaceId;
  readonly startedAt: number;
}

export interface DesignPluginInput {
  readonly planId: DesignPlanId;
  readonly tenantId: DesignTenantId;
  readonly workspaceId: DesignWorkspaceId;
  readonly stage: DesignStage;
}

export interface DesignPluginOutput {
  readonly traceId: DesignPlanId;
  readonly signal: PlanSignal;
  readonly tags: readonly StageAware[];
  readonly nextStage: DesignStage;
}

export interface DesignPluginContract<
  TInput extends DesignPluginInput = DesignPluginInput,
  TOutput extends DesignPluginOutput = DesignPluginOutput,
  TLane extends PluginLane = PluginLane,
  TStage extends DesignStage = DesignStage,
> {
  readonly id: DesignPluginId;
  readonly lane: `plugin:${TLane}`;
  readonly stage: TStage;
  readonly phase: StageAware<TStage>;
  readonly weight: number;
  readonly route: StageSignalRoute<import('./contracts').DesignSignalKind, TStage>;
  readonly run: (input: NoInfer<TInput>, context: NoInfer<DesignPluginContext>) => Promise<TOutput> | TOutput;
}

interface PluginLease {
  readonly value: string;
}

class PluginLeaseScope implements AsyncDisposable {
  readonly value: string;
  constructor(value: string) {
    this.value = value;
  }
  async [Symbol.asyncDispose](): Promise<void> {
    return Promise.resolve();
  }
}

export interface PluginStackSummary {
  readonly count: number;
  readonly lanes: readonly string[];
  readonly totalWeight: number;
}

type AnyPlugin = DesignPluginContract<DesignPluginInput, DesignPluginOutput, PluginLane, DesignStage>;

type Registry<TPlugins extends readonly AnyPlugin[]> = ReadonlyMap<string, AnyPlugin>;

export class DesignPluginStack<TPlugins extends readonly AnyPlugin[]> {
  readonly #plugins: TPlugins;
  readonly #registry: Registry<TPlugins>;

  private constructor(plugins: TPlugins) {
    this.#plugins = plugins;
    this.#registry = new Map<string, AnyPlugin>(
      plugins.map((plugin) => [String(plugin.id), plugin]),
    ) as Registry<TPlugins>;
  }

  static empty(): DesignPluginStack<readonly []> {
    return new DesignPluginStack([]);
  }

  static from<TInput extends readonly AnyPlugin[]>(plugins: TInput): DesignPluginStack<TInput> {
    return new DesignPluginStack(plugins);
  }

  with<TPlugin extends AnyPlugin>(plugin: TPlugin): DesignPluginStack<[...TPlugins, TPlugin]> {
    return new DesignPluginStack([...this.#plugins, plugin]);
  }

  readonly list = (): readonly AnyPlugin[] => [...this.#plugins];

  get(pluginId: string): AnyPlugin | undefined {
    return this.#registry.get(pluginId);
  }

  readonly lanes = (): readonly `plugin:${PluginLane}`[] => [...new Set(this.#plugins.map((plugin) => plugin.lane))] as readonly `plugin:${PluginLane}`[];

  summarize(): PluginStackSummary {
    const lanes = this.lanes();
    return {
      count: this.#plugins.length,
      lanes,
      totalWeight: this.#plugins.reduce((sum, plugin) => sum + plugin.weight, 0),
    };
  }

  async runChain(
    pluginIds: readonly string[],
    seed: DesignPluginInput,
    context: DesignPluginContext,
    trace: (entry: string) => void,
  ): Promise<readonly DesignPluginOutput[]> {
    await using scope = createDisposableScope();
    const orderedPlugins = pluginIds
      .map((pluginId) => this.#registry.get(pluginId))
      .filter((plugin): plugin is AnyPlugin => plugin !== undefined);
    const outputs: DesignPluginOutput[] = [];
    let payload: DesignPluginInput & Record<string, unknown> = { ...seed };

    for (const plugin of orderedPlugins) {
      await using lease = new PluginLeaseScope(String(plugin.id));
      void lease;
      const result = await plugin.run(payload, context);
      payload = {
        ...payload,
        stage: result.nextStage,
      };
      outputs.push(result);
      trace(`${plugin.id}:${payload.stage}`);
    }

    void scope;
    return outputs;
  }

  byStage(stage: DesignStage): readonly AnyPlugin[] {
    return this.#plugins.filter((plugin) => plugin.stage === stage);
  }
}

const makeStageAware = (stage: DesignStage): StageAware => `stage:${stage}` as StageAware;

export const mapPluginsToIds = <TPlugins extends readonly AnyPlugin[]>(stack: DesignPluginStack<TPlugins>): readonly string[] =>
  stack.list().map((plugin) => plugin.id);

export const toPluginId = (value: string): DesignPluginId =>
  withBrand(`plugin:${value}`, 'DesignPluginId') satisfies DesignPluginId;

export const makePhase = (stage: DesignStage): StageAware => makeStageAware(stage);

export const runTag = (index: number): `run:${number}` => `run:${index}`;
