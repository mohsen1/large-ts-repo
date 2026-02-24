import { Brand, type NoInfer, type Prettify } from '@shared/type-level';

export type NoInferType<T> = NoInfer<T>;
export type LabPluginPrefix = `recovery-lab-console`;
export type LabStage = 'collect' | 'input' | 'resolve' | 'simulate' | 'recommend' | 'report' | 'synthesize' | 'audit';
export type LabScope = 'topology' | 'signal' | 'command' | 'readiness' | 'policy' | 'workload' | 'synthesis';
export type PluginCategory = 'telemetry' | 'planner' | 'simulation' | 'governance' | 'policy' | 'synthesis';

export type LabRunId = Brand<string, 'LabRunId'>;
export type LabPluginId = Brand<string, 'LabPluginId'>;
export type LabPluginName = Brand<string, 'LabPluginName'>;
export type LabWorkspaceId = Brand<string, 'LabWorkspaceId'>;
export type LabTenantId = Brand<string, 'LabTenantId'>;

export type LabLifecycleState = `${LabPluginPrefix}:${LabStage}`;
export type PluginTopic<TPrefix extends string = string, TIndex extends string = string> = `${TPrefix}:${TIndex}`;
export type EventChannel<TTenant extends string = string> = `lab:${TTenant}:stream`;
export type TraceKey<TStage extends LabStage> = `${TStage}::trace`;
export type PipelineKey<TStage extends LabStage = LabStage, TScope extends LabScope = LabScope> = `${TScope}.${TStage}`;

export interface LabPluginContext<T extends Record<string, unknown> = Record<string, unknown>> {
  readonly runId: LabRunId;
  readonly tenantId: LabTenantId;
  readonly stage: LabStage;
  readonly scope: LabScope;
  readonly category: PluginCategory;
  readonly workspaceId: LabWorkspaceId;
  readonly startedAt: string;
  readonly metadata: T;
}

export interface LabPlugin<
  TName extends string = string,
  TInput = unknown,
  TOutput = unknown,
  TConsumes extends readonly string[] = readonly string[],
  TEmits extends readonly string[] = readonly string[],
  TCategory extends PluginCategory = PluginCategory,
  TStage extends LabStage = LabStage,
  TScope extends LabScope = LabScope,
> {
  readonly id: LabPluginId;
  readonly name: LabPluginName & TName;
  readonly category: TCategory;
  readonly stage: TStage;
  readonly scope: TScope;
  readonly dependencies: readonly LabPluginId[];
  readonly emits: TEmits;
  readonly consumes: TConsumes;
  readonly version: `${number}.${number}.${number}`;
  run(input: TInput, context: LabPluginContext): Promise<TOutput>;
}

export type PluginHandlePayload<TChain extends readonly LabRuntimeEvent[] = readonly LabRuntimeEvent[]> = {
  readonly input: TChain;
  readonly startedAt: string;
  readonly endedAt: string;
};

export type PluginInput<T extends LabPlugin> = T extends LabPlugin<any, infer TInput, any> ? TInput : never;
export type PluginOutput<T extends LabPlugin> = T extends LabPlugin<any, any, infer TOutput, any, any> ? TOutput : never;

export type PluginChainInput<TPlugins extends readonly LabPlugin[]> = TPlugins extends readonly [infer Head extends LabPlugin, ...infer _]
  ? PluginInput<Head>
  : never;

export type PluginChainOutput<TPlugins extends readonly LabPlugin[]> = TPlugins extends readonly [
  ...infer _Prefix,
  infer Last extends LabPlugin,
  ...infer Rest,
]
  ? Rest extends readonly [
      infer _Head extends LabPlugin,
      ...infer _Tail extends readonly LabPlugin[],
    ]
    ? PluginChainOutput<Rest extends readonly LabPlugin[] ? Rest : never>
    : PluginOutput<Last>
  : never;

export type StageDiagnostics = {
  readonly timeline: readonly LabStage[];
  readonly stageCount: number;
  readonly trace: readonly string[];
};

export type PluginManifestMap<TPlugins extends readonly LabPlugin[]> = {
  [K in TPlugins[number] as PluginTopic<'plugin', K['name']>]: {
    readonly id: K['id'];
    readonly stage: K['stage'];
    readonly scope: K['scope'];
  };
};

export type RemapSignalMap<T extends Record<string, unknown>> = {
  [K in keyof T as K extends string ? `${K}::mapped` : never]: T[K];
};

export type RecursiveTuple<T extends readonly unknown[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? [Head, ...RecursiveTuple<Tail & readonly unknown[]>]
    : readonly [];

export type LabRuntimeEvent<TPayload = unknown> =
  | {
      readonly kind: 'plugin.started';
      readonly pluginId: LabPluginId;
      readonly stage: LabStage;
      readonly startedAt: string;
      readonly details: TPayload;
    }
  | {
      readonly kind: 'plugin.completed';
      readonly pluginId: LabPluginId;
      readonly stage: LabStage;
      readonly completedAt: string;
      readonly durationMs: number;
      readonly details: TPayload;
    }
  | {
      readonly kind: 'plugin.failed';
      readonly pluginId: LabPluginId;
      readonly stage: LabStage;
      readonly failedAt: string;
      readonly error: string;
      readonly details: TPayload;
    }
  | {
      readonly kind: 'run.complete';
      readonly runId: LabRunId;
      readonly stage: 'audit';
      readonly completedAt: string;
      readonly diagnostics: StageDiagnostics;
    };

export interface LabExecutionOptions {
  readonly tenantId: LabTenantId;
  readonly workspaceId: LabWorkspaceId;
  readonly allowPartialRun?: boolean;
}

export interface LabExecutionResult<TOutput = unknown> {
  readonly runId: LabRunId;
  readonly output: TOutput;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly elapsedMs: number;
  readonly diagnostics: StageDiagnostics;
}

export interface WorkspaceBlueprint {
  readonly workspaceId: LabWorkspaceId;
  readonly tenantId: LabTenantId;
  readonly name: string;
  readonly stages: readonly LabStage[];
  readonly labels: readonly string[];
  readonly createdAt: string;
}

export interface WorkspaceDraftInput<TSignals extends readonly string[] = readonly string[]> {
  readonly workspace: WorkspaceBlueprint;
  readonly signals: TSignals;
  readonly stage: LabStage;
  readonly metadata: Record<string, string>;
}

export const defaultLabStages = ['collect', 'input', 'resolve', 'simulate', 'recommend', 'report', 'synthesize', 'audit'] as const satisfies readonly LabStage[];
export const defaultScopeOrder = ['topology', 'signal', 'command', 'readiness', 'policy', 'workload', 'synthesis'] as const;

export const defaultLifecycleWeights = {
  collect: 1,
  input: 1,
  resolve: 2,
  simulate: 4,
  recommend: 3,
  report: 2,
  synthesize: 5,
  audit: 1,
} as const satisfies Record<LabStage, number>;

export type DefaultLabScope = (typeof defaultScopeOrder)[number];
export type DefaultLabStage = (typeof defaultLabStages)[number];

export const createRunId = (tenantId: string, stage: LabStage): LabRunId => `${tenantId}-${stage}-${Date.now()}` as LabRunId;
export const createPluginId = (seed: string, category: PluginCategory, stage: LabStage): LabPluginId =>
  `${category}.${stage}.${seed}` as LabPluginId;
export const createWorkspaceId = (tenantId: string, context: string): LabWorkspaceId => `${tenantId}.${context}.workspace` as LabWorkspaceId;
export const createTenantId = (tenantId: string): LabTenantId => tenantId as LabTenantId;

export const pluginTopic = <TName extends string>(name: TName): PluginTopic<'plugin', TName> =>
  `plugin:${name}` as PluginTopic<'plugin', TName>;

export const normalizePluginPayload = <T>(payload: T): { readonly input: T; readonly timestamp: string } => ({
  input: payload,
  timestamp: new Date().toISOString(),
});

export const pluginStageRank = <TStage extends LabStage>(stage: TStage): number => defaultLifecycleWeights[stage];

export const pluginChainWeight = <TStages extends readonly LabStage[]>(stages: NoInferType<TStages>): number =>
  [...stages].reduce((acc, stage) => acc + defaultLifecycleWeights[stage], 0);

export const buildTraceIndex = <TStages extends readonly LabStage[]>(
  stages: TStages,
  tenantId: string,
): TraceKey<TStages[number]>[] => {
  const timestamp = new Date().toISOString();
  return stages.map((stage) => `${stage}::trace-${tenantId}-${timestamp}` as TraceKey<TStages[number]>);
};

export const mapPluginNames = <T extends readonly LabPlugin[]>(plugins: T): readonly T[number]['name'][] =>
  plugins.map((plugin) => plugin.name);

export const toDiagnostics = <T extends { [K in keyof StageDiagnostics]: StageDiagnostics[K] }>(diagnostics: T): Prettify<T> => diagnostics;
