import { Brand } from '@shared/core';

export type Stage = 'ingest' | 'plan' | 'simulate' | 'execute' | 'observe' | 'finalize';
export type StageLabel<T extends Stage = Stage> = `${T}:${string}`;
export type ISOTime = Brand<string, 'ISOTime'>;

export type TenantId = Brand<string, 'TenantId'>;
export type IncidentId = Brand<string, 'IncidentId'>;
export type RunId = Brand<string, 'RunId'>;
export type WorkflowId = Brand<string, 'WorkflowId'>;
export type SignalId = Brand<string, 'SignalId'>;
export type PluginId = Brand<string, 'RecoveryOpsPluginId'>;
export type PluginName = Brand<string, 'RecoveryOpsPluginName'>;
export type ProfileId = Brand<string, 'ProfileId'>;
export type RequestId = Brand<string, 'RequestId'>;
export type TraceId = Brand<string, 'TraceId'>;
export type StageFingerprint = `${TenantId}#${IncidentId}`;
export type NoInfer<T> = [T][T extends never ? never : 0];

export interface TenantScope {
  readonly tenantId: TenantId;
  readonly incidentId: IncidentId;
}

export interface RecoverySignal {
  readonly id: SignalId;
  readonly source: string;
  readonly name: string;
  readonly severity: 1 | 2 | 3 | 4 | 5;
  readonly observedAt: ISOTime;
  readonly values: readonly MetricPoint[];
}

export interface RecoveryWorkflow {
  readonly id: WorkflowId;
  readonly tenantId: TenantId;
  readonly incidentId: IncidentId;
  readonly runId: RunId;
  readonly graphLabel: string;
  readonly stages: readonly Stage[];
  readonly targetWindowMinutes: number;
  readonly tags: readonly string[];
  readonly signals: readonly RecoverySignal[];
}

export interface MetricPoint {
  readonly metric: string;
  readonly value: number;
  readonly unit: 'ms' | 'ratio' | 'count' | 'pctl';
}

export interface PluginCapability {
  readonly key: string;
  readonly weight: number;
  readonly active: boolean;
}

export interface PluginMetadata {
  readonly kind: string;
  readonly version: `${number}.${number}.${number}`;
  readonly description: string;
  readonly tags: readonly string[];
  readonly capabilities: readonly PluginCapability[];
}

export interface ProfileHint {
  readonly profileId: ProfileId;
  readonly profileName: string;
  readonly strictness: number;
  readonly tags: readonly string[];
}

export interface ExecutionContext {
  readonly traceId: TraceId;
  readonly workspaceId: WorkflowId;
  readonly startedAt: ISOTime;
  readonly requestId: RequestId;
  readonly stage: Stage;
  readonly trace: readonly string[];
}

export interface OrchestratorHints {
  readonly dryRun: boolean;
  readonly trace: boolean;
  readonly timeoutMs: number;
  readonly parallelism: 1 | 2 | 4 | 8;
}

export interface OrchestratorInput {
  readonly workflow: RecoveryWorkflow;
  readonly requestedPlugins: readonly PluginId[];
  readonly limit: number;
  readonly allowParallel: boolean;
  readonly profile: ProfileHint;
}

export interface GraphDiagnostics {
  readonly pluginId: PluginId;
  readonly startedAt: ISOTime;
  readonly durationMs: number;
  readonly stage: Stage;
  readonly memo: Readonly<Record<string, unknown>>;
}

export interface PluginExecutionSummary {
  readonly pluginId: PluginId;
  readonly status: 'ok' | 'skipped' | 'errored';
  readonly metrics: readonly MetricPoint[];
}

export interface PluginSnapshot {
  readonly pluginId: PluginId;
  readonly pluginName: PluginName;
  readonly outputCount: number;
  readonly averagePayload: number;
  readonly producedAt: ISOTime;
}

export interface GraphOutput {
  readonly runId: RunId;
  readonly records: readonly PluginSnapshot[];
  readonly diagnostics: readonly GraphDiagnostics[];
}

export interface PluginResult {
  readonly pluginId: PluginId;
  readonly runId: RunId;
  readonly records: readonly PluginSnapshot[];
  readonly diagnostics: readonly GraphDiagnostics[];
}

export interface RecoveryGraphEvent<TEvent extends string = string, TPayload = unknown> {
  readonly stage: Stage;
  readonly name: `graph:${TEvent}`;
  readonly payload: TPayload;
  readonly timestamp: ISOTime;
}

export interface GraphPluginDescriptor<
  TOutput extends PluginResult = PluginResult,
  TMeta extends PluginMetadata = PluginMetadata,
> {
  readonly id: PluginId;
  readonly name: PluginName;
  readonly tenantScope: TenantScope;
  readonly stage: Stage;
  readonly dependencies: readonly PluginId[];
  readonly metadata: NoInfer<TMeta>;
  readonly run: (
    workflow: RecoveryWorkflow,
    context: ExecutionContext,
    profile: ProfileHint,
    scope: Readonly<NoInfer<Record<string, unknown>>>,
  ) => Promise<TOutput>;
}

export type AnyGraphPlugin = GraphPluginDescriptor<any, PluginMetadata>;

export type UnwrapPromise<T> = T extends Promise<infer V> ? V : T;
export type PluginResultFor<TPlugin extends AnyGraphPlugin> = UnwrapPromise<ReturnType<TPlugin['run']>>;

export type PluginOutputEnvelope<TPlugins extends readonly AnyGraphPlugin[]> = {
  [K in TPlugins[number] as K['id'] & string]: ReadonlyArray<PluginResultFor<K>>;
};

export interface PluginExecutionEnvelope<TPlugins extends readonly AnyGraphPlugin[]> {
  readonly runId: RunId;
  readonly pluginOutputs: PluginOutputEnvelope<TPlugins>;
  readonly pluginSummaries: readonly PluginExecutionSummary[];
  readonly output: GraphOutput;
}

export interface GraphCatalog {
  readonly namespace: string;
  readonly plugins: readonly AnyGraphPlugin[];
}

export interface GraphDependencyIndex {
  readonly pluginId: PluginId;
  readonly dependsOn: readonly PluginId[];
  readonly optional: readonly PluginId[];
}

export interface PluginDependencyTuple<T extends AnyGraphPlugin = AnyGraphPlugin> {
  readonly tuple: T['dependencies'];
}

export interface BuildContext {
  readonly tenantScope: TenantScope;
  readonly workflow: RecoveryWorkflow;
  readonly now: () => ISOTime;
  readonly config: OrchestratorHints;
}

export interface GraphCatalogQuery {
  readonly namespace: string;
  readonly includeDiagnostics: boolean;
  readonly includeDependencies: boolean;
}

export interface GraphDependencyContext {
  readonly node: PluginId;
  readonly edges: readonly PluginDependencyTuple[];
  readonly requestedPlugins: readonly PluginId[];
}

export type RecursivePath<T> = T extends readonly [infer Head, ...infer Tail]
  ? `${Head & string}` | `${Head & string}.${RecursivePath<Tail>}`
  : '';

export type FilterByStage<TPlugins extends readonly AnyGraphPlugin[], TStage extends Stage> =
  TPlugins extends readonly [infer H, ...infer R]
    ? H extends AnyGraphPlugin
      ? H['stage'] extends TStage
        ? readonly [H, ...FilterByStage<R & readonly AnyGraphPlugin[], TStage>]
        : FilterByStage<R & readonly AnyGraphPlugin[], TStage>
      : readonly []
    : readonly [];

export const normalizeLimit = (input: number): number => {
  const normalized = Number.isFinite(input) ? Math.trunc(input) : 1;
  if (normalized <= 0) return 1;
  if (normalized > 5_000) return 5_000;
  return normalized;
};

export const formatISO = (date: Date): ISOTime => date.toISOString() as ISOTime;

export const buildTimelineTag = (plugin: PluginId, stage: Stage): StageLabel => {
  return `${stage}:${plugin as string}` as StageLabel;
};

export const withDefaults = (input: OrchestratorInput): OrchestratorInput => ({
  ...input,
  limit: normalizeLimit(input.limit),
  requestedPlugins: input.requestedPlugins,
});

export const samplePlugin = <T extends AnyGraphPlugin>(plugin: T): T => plugin;
