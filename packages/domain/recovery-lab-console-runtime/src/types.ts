import { type Brand, type Expand } from '@shared/core';
import type { NoInfer, Prettify, RecursivePath } from '@shared/type-level';

export const runtimeScopes = ['topology', 'signal', 'policy', 'command', 'telemetry', 'synthesis'] as const;
export type RuntimeScope = (typeof runtimeScopes)[number];

export const runtimeStages = ['collect', 'normalize', 'adapt', 'simulate', 'forecast', 'recommend', 'report', 'audit'] as const;
export type RuntimeStage = (typeof runtimeStages)[number];

export const executionBands = ['low', 'medium', 'high', 'critical'] as const;
export type ExecutionBand = (typeof executionBands)[number];

export const runtimePolicyModes = ['manual', 'adaptive', 'predictive', 'resilient'] as const;
export type RuntimePolicyMode = (typeof runtimePolicyModes)[number];

export type RuntimeTenantId = Brand<string, 'RuntimeTenantId'>;
export type RuntimeWorkspaceId = Brand<string, 'RuntimeWorkspaceId'>;
export type RuntimeRunId = Brand<string, 'RuntimeRunId'>;
export type RuntimePluginId = Brand<string, 'RuntimePluginId'>;
export type RuntimeSessionId = Brand<string, 'RuntimeSessionId'>;

export const runtimeIdPatterns = {
  tenant: 'tenant',
  workspace: 'workspace',
  run: 'run',
  session: 'session',
  plugin: 'plugin',
} as const;

export type RuntimeEventKind =
  | 'plugin.started'
  | 'plugin.completed'
  | 'plugin.failed'
  | 'runtime.started'
  | 'runtime.finished'
  | 'runtime.failed';

export type RuntimeEventChannel<
  TKind extends RuntimeEventKind = RuntimeEventKind,
  TScope extends RuntimeScope = RuntimeScope,
  TRun extends string = string,
> = `${TRun}:${TScope}:${TKind}`;

export type RuntimeDependency = `dependency:${RuntimeScope}:${RuntimePluginId}`;

export interface RuntimeContext {
  readonly runId: RuntimeRunId;
  readonly sessionId: RuntimeSessionId;
  readonly tenantId: RuntimeTenantId;
  readonly workspaceId: RuntimeWorkspaceId;
  readonly scope: RuntimeScope;
  readonly stage: RuntimeStage;
  readonly mode: RuntimePolicyMode;
  readonly startedAt: string;
  readonly metadata: Record<string, string>;
}

export interface RuntimeRuntimeState {
  readonly runId: RuntimeRunId;
  readonly sessionId: RuntimeSessionId;
  readonly stage: RuntimeStage;
  readonly activePlugin: RuntimePluginId | null;
  readonly progress: number;
  readonly traces: number;
}

export interface RuntimeEventPayload<TRunPayload extends Record<string, unknown> = Record<string, unknown>> {
  readonly channel: RuntimeEventChannel;
  readonly at: string;
  readonly payload: TRunPayload;
}

export interface RuntimePluginRuntimeLog {
  readonly pluginId: RuntimePluginId;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly ok: boolean;
  readonly durationMs: number;
}

export interface RuntimePlugin<
  TName extends string = string,
  TInput = unknown,
  TOutput = unknown,
  TScope extends RuntimeScope = RuntimeScope,
  TStage extends RuntimeStage = RuntimeStage,
  TMetadata extends Record<string, string> = Record<string, string>,
> {
  readonly id: RuntimePluginId;
  readonly name: TName;
  readonly stage: TStage;
  readonly scope: TScope;
  readonly mode: RuntimePolicyMode;
  readonly dependencies: readonly RuntimePluginId[];
  readonly produces: readonly string[];
  readonly consumes: readonly string[];
  readonly weight: number;
  readonly metadata: TMetadata;
  readonly version: `${number}.${number}.${number}`;
  execute(input: TInput, context: RuntimeContext): Promise<TOutput>;
}

export interface RuntimeManifest<
  TPlugin extends RuntimePlugin = RuntimePlugin,
  TName extends string = string,
  TGroup extends string = string,
> {
  readonly plugin: TPlugin;
  readonly name: Brand<TName, 'RuntimePluginName'>;
  readonly category: RuntimeScope;
  readonly group: Brand<TGroup, 'RuntimePluginGroup'>;
  readonly priority: number;
  readonly tags: readonly string[];
  readonly channel: RuntimeEventChannel;
}

export type PluginName<TPlugin extends RuntimePlugin = RuntimePlugin> = TPlugin['name'];
export type PluginId<TPlugin extends RuntimePlugin = RuntimePlugin> = TPlugin['id'];

export type PluginInput<TPlugin> = TPlugin extends RuntimePlugin<infer _N, infer TInput, unknown> ? TInput : never;
export type PluginOutput<TPlugin> = TPlugin extends RuntimePlugin<infer _N, unknown, infer TOutput> ? TOutput : never;

export type PluginChain<TPlugins extends readonly RuntimePlugin[]> =
  TPlugins extends readonly [infer _Head extends RuntimePlugin, ...infer Tail extends readonly RuntimePlugin[]]
    ? readonly [_Head, ...Tail]
    : readonly [];

export type PluginChainHeadInput<TPlugins extends readonly RuntimePlugin[]> =
  TPlugins extends readonly [infer Head extends RuntimePlugin, ...readonly RuntimePlugin[]]
    ? PluginInput<Head>
    : never;

export type PluginChainOutput<TPlugins extends readonly RuntimePlugin[]> =
  TPlugins extends readonly [...Readonly<RuntimePlugin[]>, infer Tail extends RuntimePlugin]
    ? PluginOutput<Tail>
    : never;

export type PluginChainCompatible<TPlugins extends readonly RuntimePlugin[]> =
  TPlugins extends readonly [
    infer Head extends RuntimePlugin,
    infer Next extends RuntimePlugin,
    ...infer Rest extends readonly RuntimePlugin[],
  ]
    ? PluginOutput<Head> extends PluginInput<Next>
      ? PluginChainCompatible<[Next, ...Rest]>
      : never
    : TPlugins;

export type PluginMapByName<TPlugins extends readonly RuntimePlugin[]> = {
  [K in TPlugins[number] as K['name'] extends string ? `manifest:${K['name']}` : never]: K;
};

export type PluginMapById<TPlugins extends readonly RuntimePlugin[]> = {
  [K in TPlugins[number] as K['id'] extends string ? `id:${K['id']}` : never]: K;
};

export type PluginChannelMap<T extends readonly RuntimeManifest[]> = {
  [K in T[number] as K['channel']]: K;
};

export type RecursiveTuple<T extends readonly unknown[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? [Head, ...RecursiveTuple<Tail & readonly unknown[]>]
    : readonly [];

export type MergeRuntimeMetadata<T extends readonly RuntimeManifest[]> = {
  [K in T[number] as K['group'] & string]: K extends RuntimeManifest<infer _P, infer Name, infer TGroup>
    ? {
        readonly group: TGroup;
        readonly plugin: K['plugin'];
      }
    : never;
};

export type RuntimeTemplateInput<T extends string> = {
  readonly templateId: Brand<T, 'RuntimeTemplate'>;
  readonly payload: string;
};

export type RuntimeDiagnostics = {
  readonly runId: RuntimeRunId;
  readonly pluginCount: number;
  readonly durationMs: number;
  readonly stageCount: number;
  readonly channelCount: number;
};

export type RuntimeRunResult<TPayload = unknown> = {
  readonly runId: RuntimeRunId;
  readonly workspaceId: RuntimeWorkspaceId;
  readonly sessionId: RuntimeSessionId;
  readonly output: TPayload;
  readonly stage: RuntimeStage;
  readonly diagnostics: RuntimeDiagnostics;
  readonly manifests: readonly RuntimeManifest[];
};

export type RuntimeExecutionLog = {
  readonly pluginId: RuntimePluginId;
  readonly pluginName: string;
  readonly scope: RuntimeScope;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly eventChannel: RuntimeEventChannel;
};

export type RuntimeValidationIssue = {
  readonly path: RecursivePath<RuntimeContext>;
  readonly message: string;
};

export type RuntimeValidationResult =
  | {
      readonly ok: true;
      readonly warnings: readonly string[];
    }
  | {
      readonly ok: false;
      readonly issues: readonly RuntimeValidationIssue[];
    };

export const runtimeScopeForPlugin = <TScope extends RuntimeScope>(scope: TScope): TScope => scope;
export const runtimeEventChannel = <TScope extends RuntimeScope, TRun extends string>(
  scope: TScope,
  runId: TRun,
): RuntimeEventChannel<RuntimeEventKind, TScope, TRun> =>
  `${runId}:${scope}:plugin.started` as RuntimeEventChannel<RuntimeEventKind, TScope, TRun>;

export const toRuntimeId = (prefix: string, raw: string): string => `${prefix}:${raw}`;

export const createTenantId = (value: string): RuntimeTenantId => `tenant-${value.trim()}` as RuntimeTenantId;
export const createWorkspaceId = (tenant: string, context: string): RuntimeWorkspaceId =>
  `${tenant}.workspace.${context}` as RuntimeWorkspaceId;
export const createSessionId = (tenant: string, workspace: string): RuntimeSessionId =>
  `${tenant}.session.${workspace}` as RuntimeSessionId;
export const createRunId = (tenantId: RuntimeTenantId, scope: RuntimeScope): RuntimeRunId =>
  `${tenantId}.${scope}.${Date.now()}` as RuntimeRunId;
export const createPluginId = (seed: string, stage: RuntimeStage): RuntimePluginId => `${seed}::${stage}` as RuntimePluginId;

export const makeRuntimeManifest = <
  TName extends string,
  TGroup extends string,
  TPlugin extends RuntimePlugin<TName>,
>(
  plugin: TPlugin,
  opts: { readonly group: TGroup; readonly category: RuntimeScope; readonly priority: NoInfer<number> },
): RuntimeManifest<TPlugin, TName, TGroup> => {
  const channel = `${plugin.id}:${plugin.stage}:channel` as RuntimeEventChannel;
  return {
    plugin,
    name: String(plugin.name) as Brand<TName, 'RuntimePluginName'>,
    category: opts.category,
    group: String(opts.group) as Brand<TGroup, 'RuntimePluginGroup'>,
    priority: opts.priority,
    tags: [...plugin.produces, ...plugin.consumes],
    channel,
  };
};

export const normalizeRuntimeMetadata = <T extends Record<string, unknown>>(
  metadata: T,
): Prettify<Expand<T & { readonly __normalized: true }>> => ({
  ...metadata,
  __normalized: true,
}) as Prettify<Expand<T & { readonly __normalized: true }>>;

export const pluginVersion = <T extends number>(value: T): `${T}.${number}.${number}` => `${value}.0.0` as `${T}.${number}.${number}`;
export const toDiagnostics = <T extends RuntimeDiagnostics>(diagnostics: T): Prettify<T> => diagnostics;

export const satisfyNoInfer = <T>(value: NoInfer<T>): T => value;
