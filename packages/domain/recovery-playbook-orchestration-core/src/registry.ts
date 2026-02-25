import type { Brand } from '@shared/core';
import { type PlaybookPhase, type RuntimeEnvelope, type StagePlan } from './models';

export interface PluginIdentity {
  id: Brand<string, 'PlaybookPlugin'>;
  kind: string;
  version: `${number}.${number}.${number}`;
}

export interface PluginExecutorInput<TContext, TInput> {
  readonly context: TContext;
  readonly input: TInput;
}

export interface PluginExecutorOutput<TOutput> {
  readonly output: TOutput;
  readonly envelopes: readonly RuntimeEnvelope[];
  readonly phase: PlaybookPhase;
}

export type PluginExecutor<TContext, TInput, TOutput> = (
  payload: PluginExecutorInput<TContext, TInput>,
) => Promise<PluginExecutorOutput<TOutput>>;

export interface PlaybookAutomationPlugin<TContext, TInput, TOutput = unknown>
  extends PluginIdentity {
  readonly capabilities: readonly string[];
  readonly stages: readonly StagePlan[];
  readonly run: PluginExecutor<TContext, TInput, TOutput>;
}

export type PluginMap<TPlugins extends readonly PlaybookAutomationPlugin<unknown, unknown, unknown>[]> = {
  [K in TPlugins[number] as K['id']]: K;
};

export type PluginLookup<TPlugins extends Record<string, PlaybookAutomationPlugin<unknown, unknown, unknown>>> = {
  [K in keyof TPlugins]: TPlugins[K]['run'];
};

export type PluginEvents<TPlugin> =
  TPlugin extends PlaybookAutomationPlugin<infer TContext, infer TInput, infer TOutput>
    ? {
        run: PluginExecutor<TContext, TInput, TOutput>;
      }
    : never;

export interface PluginTelemetry {
  name: string;
  phase: PlaybookPhase;
  executedAt: string;
  ok: boolean;
}

export class AutomationPluginRegistry<TPlugins extends readonly PlaybookAutomationPlugin<unknown, unknown, unknown>[]> {
  private readonly pluginById = new Map<string, TPlugins[number]>();
  private readonly telemetry: PluginTelemetry[] = [];

  constructor(private readonly plugins: TPlugins) {
    for (const plugin of plugins) {
      this.pluginById.set(String(plugin.id), plugin);
    }
  }

  get registry(): PluginMap<TPlugins> {
    const out = Object.fromEntries(this.plugins.map((plugin) => [plugin.id, plugin])) as PluginMap<TPlugins>;
    return out;
  }

  list(): ReadonlyArray<TPlugins[number]> {
    return [...this.plugins];
  }

  get<K extends TPlugins[number]['id']>(id: K): PluginMap<TPlugins>[K] | undefined {
    return this.pluginById.get(id as string) as PluginMap<TPlugins>[K] | undefined;
  }

  async execute<TContext, TInput, TOutput>(
    input: PluginExecutorInput<TContext, TInput>,
    plugin: PlaybookAutomationPlugin<TContext, TInput, TOutput>,
  ): Promise<PluginExecutorOutput<TOutput>> {
    const output = await plugin.run(input);
    this.telemetry.push({
      name: String(plugin.id),
      phase: output.phase,
      executedAt: new Date().toISOString(),
      ok: output.phase !== 'finished',
    });
    return output;
  }

  history(): readonly PluginTelemetry[] {
    return [...this.telemetry];
  }
}

export const buildPluginSnapshot = <
  TPlugins extends readonly PlaybookAutomationPlugin<unknown, unknown, unknown>[],
>(
  plugins: TPlugins,
): PluginMap<TPlugins> => {
  const map = Object.fromEntries(plugins.map((plugin) => [plugin.id, plugin])) as PluginMap<TPlugins>;
  return map;
};
