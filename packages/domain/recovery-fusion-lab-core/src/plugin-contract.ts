import type { NoInfer } from '@shared/type-level';
import type { LabWavePhase } from './identifiers';
import type { LabMetricPoint } from './models';
import type { LabPluginId, LabRunId } from './identifiers';

export type LabPhaseTag = `fusion-phase:${LabWavePhase}`;
export type LabChannel = 'telemetry' | 'policy' | 'control' | 'analytics';

export type PluginName = `fusion-lab-plugin:${string}`;
export type PluginVersion = `${number}.${number}.${number}`;
export type PluginRegistryKey = `${string}::${string}`;

export interface LabPluginManifest {
  readonly pluginId: LabPluginId;
  readonly name: PluginName;
  readonly version: PluginVersion;
  readonly namespace: `lab-${string}`;
  readonly phase: LabWavePhase;
  readonly channel: LabChannel;
  readonly tags: readonly string[];
  readonly canMutate: boolean;
  readonly priority: 0 | 1 | 2 | 3 | 4 | 5;
}

export interface LabPluginContext {
  readonly runId: LabRunId;
  readonly phase: LabWavePhase;
  readonly scope: Readonly<Record<string, unknown>>;
  readonly emitMetric: (metric: LabMetricPoint) => void;
  readonly emitCommand: (command: string) => void;
  readonly logger: (message: string) => void;
}

export interface LabPlugin<TInput = unknown, TOutput = unknown> {
  readonly manifest: Readonly<LabPluginManifest>;
  readonly configure: (context: LabPluginContext) => Promise<TInput>;
  readonly execute: (input: TInput, context: LabPluginContext) => Promise<TOutput>;
  readonly dispose?: () => Promise<void> | void;
}

export type PluginMap<TPlugins extends readonly LabPlugin[]> = {
  [K in TPlugins[number] as K['manifest']['name']]: K;
};

export type PluginNameFromPlugins<TPlugins extends readonly LabPlugin[]> = keyof PluginMap<TPlugins>;

export type PluginInputFor<
  TPlugins extends readonly LabPlugin[],
  TName extends PluginNameFromPlugins<TPlugins>,
> = TPlugins[number] extends infer Plugin
  ? Plugin extends { manifest: { name: TName }; configure: (input: infer Input, context: never) => Promise<unknown> }
    ? NoInfer<Input>
    : never
  : never;

export type PluginOutputFor<
  TPlugins extends readonly LabPlugin[],
  TName extends PluginNameFromPlugins<TPlugins>,
> = TPlugins[number] extends infer Plugin
  ? Plugin extends { manifest: { name: TName }; execute: (input: never, context: never) => Promise<infer Output> }
    ? Output
    : never
  : never;

export type PluginConfigShape<TPlugin> = TPlugin extends { manifest: infer Manifest; configure: (input: unknown, context: never) => Promise<infer Input> }
  ? { readonly plugin: Manifest; readonly input: Input }
  : never;

export type PluginExecutionShape<TPlugin> = TPlugin extends { manifest: infer Manifest; execute: (input: unknown, context: never) => Promise<infer Output> }
  ? { readonly plugin: Manifest; readonly output: Output }
  : never;

export type PluginLifecycle<TPlugin extends LabPlugin> = {
  readonly manifest: TPlugin['manifest'];
  readonly config: Awaited<ReturnType<TPlugin['configure']>>;
  readonly output: Awaited<ReturnType<TPlugin['execute']>>;
};

export interface PluginRunResult<TPlugin extends LabPlugin = LabPlugin> {
  readonly manifest: TPlugin['manifest'];
  readonly config: Awaited<ReturnType<TPlugin['configure']>>;
  readonly output: Awaited<ReturnType<TPlugin['execute']>>;
  readonly elapsedMs: number;
}

export interface PluginDependency<TName extends PluginName = PluginName> {
  readonly pluginName: TName;
  readonly required: boolean;
  readonly dependsOn: readonly TName[];
}

export interface PluginManifestCatalog<TPlugins extends readonly LabPlugin[] = readonly LabPlugin[]> {
  readonly total: number;
  readonly plugins: PluginMap<TPlugins>;
  readonly ordered: readonly PluginNameFromPlugins<TPlugins>[];
}

export interface RegistryRuntime {
  readonly tenant: string;
  readonly revision: string;
  readonly updatedAt: string;
}

export const pluginNameFromManifest = (manifest: LabPluginManifest): PluginName => manifest.name;

export const pluginKey = (manifest: LabPluginManifest): PluginRegistryKey => `${manifest.namespace}::${manifest.name}`;

export const makePluginPhaseMarker = (phase: LabWavePhase): LabPhaseTag => `fusion-phase:${phase}`;
