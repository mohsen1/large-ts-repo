import type {
  PluginDefinition,
  PluginLifecycleContext,
  PluginResult,
  PluginTelemetry,
  PluginRegistry,
  RuntimeSignal,
} from '@shared/orchestration-lab-core';
import type { CommandId, CommandCorrelationId, LabMode, LabPlanInput, LabPlanOutput, TenantId } from './types';

export type ChaosNamespace = `namespace:${string}`;

export interface ChaosRuntimeSignal extends RuntimeSignal {
  readonly mode: LabMode;
  readonly tenant: TenantId;
}

export interface ChaosTelemetry extends PluginTelemetry {
  readonly scope: `scope:lab:${LabMode}`;
  readonly metric: PluginTelemetry['metric'];
  readonly phase: `stage:${string}`;
}

export type ChaosResult<TOutput> = Omit<PluginResult<TOutput>, 'telemetry'> & {
  readonly telemetry: ChaosTelemetry;
  readonly summary: string;
};

export interface ChaosPluginDefinition<
  TName extends `plugin:${string}` = `plugin:${string}`,
  TInput = unknown,
  TOutput = unknown,
> extends Omit<PluginDefinition<TName, unknown, TOutput, ChaosNamespace>, 'run'> {
  readonly name: TName;
  readonly namespace: ChaosNamespace;
  readonly run: (
    input: unknown,
    context: PluginLifecycleContext,
    runtime: readonly RuntimeSignal[],
  ) => Promise<ChaosResult<TOutput>> | ChaosResult<TOutput>;
}

export interface ChaosRegistryOptions<TPlugins extends readonly ChaosPluginDefinition[]> {
  readonly tenant: TenantId;
  readonly mode: LabMode;
  readonly plugins: TPlugins;
}

export interface ChaosOrchestrationContext {
  readonly tenant: TenantId;
  readonly commandId: CommandId;
  readonly runId: string;
  readonly mode: LabMode;
  readonly correlationId?: CommandCorrelationId;
}

export interface ChaosWorkspaceAdapter {
  toPlanInput(signalSeed: readonly ChaosRuntimeSignal[]): LabPlanInput;
  adaptOutput(output: LabPlanOutput): LabPlanOutput;
}

export interface ChaosExecutionEnvelope<TOutput> {
  readonly name: string;
  readonly runId: string;
  readonly output: TOutput;
  readonly telemetry: ChaosTelemetry;
}

export const resolvePlugins = <TPlugins extends readonly ChaosPluginDefinition[]>(
  registry: PluginRegistry<TPlugins>,
): readonly TPlugins[number][] => [...registry.values()];
