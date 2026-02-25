import type { NoInfer } from '@shared/type-level';
import type { PluginName, PluginDependency } from '@shared/typed-orchestration-core';
import type { MeshPluginNamespace } from './types.js';
import type { PluginInputEnvelope, PluginRuntimeContext } from './types.js';

export type MeshPluginVersion = `v${number}.${number}.${number}`;

export interface MeshPluginMeta {
  readonly domain: 'ecosystem';
  readonly surface: 'cockpit' | 'orchestrator' | 'console';
  readonly maintainers: readonly string[];
  readonly docs?: string;
}

export interface MeshPluginDefinition<
  TInput extends Record<string, unknown> = Record<string, unknown>,
  TOutput extends Record<string, unknown> = Record<string, unknown>,
  TStage extends PluginRuntimeContext['stage'] = PluginRuntimeContext['stage'],
  TOutputDependencies extends readonly PluginDependency[] = readonly PluginDependency[],
> {
  readonly namespace: MeshPluginNamespace;
  readonly name: PluginName;
  readonly version: MeshPluginVersion;
  readonly stage: TStage;
  readonly tags: readonly string[];
  readonly dependencies: readonly PluginName[];
  readonly input: TInput;
  readonly output: TOutput;
  readonly outputDependencies?: TOutputDependencies;
  readonly metadata: MeshPluginMeta;
  run(
    input: NoInfer<TInput>,
    context: Omit<PluginRuntimeContext, 'stage'> & {
      readonly pluginRun: `run-${TStage}`;
      readonly eventId: string;
    },
  ): Promise<TOutput>;
}

export type MeshPluginRuntimeInput<TPlugin extends MeshPluginDefinition> = TPlugin['input'] & {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly runId: string;
};

export type MeshPluginInputRecord<TPlugins extends readonly MeshPluginDefinition[]> = {
  [K in TPlugins[number] as K['name'] & string]: K['input'];
};

export type MeshPluginOutputRecord<TPlugins extends readonly MeshPluginDefinition[]> = {
  [K in TPlugins[number] as K['name'] & string]: K extends MeshPluginDefinition<any, infer TOutput> ? TOutput : never;
};

export type MeshPluginByName<
  TPlugins extends readonly MeshPluginDefinition[],
  TName extends TPlugins[number]['name'],
> = Extract<TPlugins[number], { name: TName }>;

export interface MeshRegistryPlan<TPlugins extends readonly MeshPluginDefinition[]> {
  readonly plugins: TPlugins;
  readonly order: readonly TPlugins[number]['name'][];
  readonly stages: readonly PluginRuntimeContext['stage'][];
}

export type PluginEnvelope<TInput extends Record<string, unknown>, TOutput extends Record<string, unknown>> = {
  readonly pluginId: PluginName;
  readonly input: NoInfer<TInput>;
  readonly expectedOutput: NoInfer<TOutput>;
  readonly context: PluginRuntimeContext;
};

export type PluginResult<TOutput extends Record<string, unknown>> = {
  readonly pluginId: PluginName;
  readonly output: TOutput;
  readonly diagnostics: readonly string[];
  readonly elapsedMs: number;
};

export type PluginEvent<TOutput extends Record<string, unknown>> = {
  readonly pluginId: PluginName;
  readonly payload: PluginInputEnvelope<TOutput, PluginName>;
  readonly result: PluginResult<TOutput>;
};

export const toPluginInput = <
  TInput extends Record<string, unknown>,
  TOutput extends Record<string, unknown>,
>(
  plugin: MeshPluginDefinition<TInput, TOutput>,
  input: PluginRuntimeContext & PluginInputEnvelope<TInput, PluginName>,
): PluginInputEnvelope<TInput, PluginName> => ({
  tenantId: input.tenantId,
  workspaceId: input.workspaceId,
  runId: input.runId,
  pluginName: plugin.name,
  pluginVersion: `${plugin.version}`,
  payload: input.payload,
  metadata: input.metadata,
});

export const buildPluginEnvelope = <
  TInput extends Record<string, unknown>,
  TOutput extends Record<string, unknown>,
>(
  plugin: MeshPluginDefinition<TInput, TOutput>,
  input: TInput,
  context: PluginRuntimeContext,
): PluginEnvelope<TInput, TOutput> => ({
  pluginId: plugin.name,
  input,
  expectedOutput: plugin.output,
  context,
});
