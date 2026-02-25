import type { Brand, ResultState, PageResult } from '@shared/core';
import type { NoInfer } from '@shared/type-level';
import type {
  TenantId,
  WorkspaceId,
  ArtifactId,
  RunId,
  SessionId,
  PluginId,
  TraceId,
} from './ids';

export const pluginKind = ['planner', 'validator', 'executor', 'auditor'] as const;
export type PluginKind = (typeof pluginKind)[number];
export type StageName = Lowercase<string> & {
  readonly __brand?: never;
};

export type StagePath<TName extends string> = `${TName}::${PluginKind}`;
export type EventName<TNamespace extends string> = `${TNamespace}.${string}`;
export type EventPayloadByScope<TScope extends string> = { readonly scope: TScope; readonly at: string };
export type StudioStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type StudioSpan = Brand<string, 'StudioSpan'>;

export interface StudioPluginContext {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly requestId: TraceId;
}

export interface StudioArtifact {
  readonly artifactId: ArtifactId;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly label: string;
  readonly tags: readonly string[];
  readonly createdAt: string;
}

export type JsonValue = string | number | boolean | null | { readonly [k: string]: JsonValue | undefined } | readonly JsonValue[];

export interface StudioCommandRunContext {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly artifact: Pick<StudioArtifact, 'artifactId' | 'label'>;
  readonly runId: RunId;
  readonly sessionId: SessionId;
  readonly options: Readonly<Record<string, JsonValue>>;
}

export interface StudioPluginMetadata<T extends string> {
  readonly kind: T;
  readonly version: `v${number}.${number}`;
  readonly dependencies: readonly string[];
  readonly capabilities: readonly StageName[];
}

export interface StudioPluginDefinition<
  TPluginKind extends PluginKind,
  TInput,
  TOutput = unknown,
> {
  readonly id: PluginId;
  readonly kind: TPluginKind;
  readonly metadata: StudioPluginMetadata<TPluginKind>;
  readonly setup: (
    context: NoInfer<StudioPluginContext>,
    input: NoInfer<TInput>,
  ) => Promise<TOutput> | TOutput;
  readonly teardown?: (context: StudioPluginContext, output: TOutput) => Promise<void> | void;
}

export type StageDescriptor<TInput, TOutput> = {
  readonly stage: StageName;
  readonly input: TInput;
  readonly output: TOutput;
};

export type PluginDefinitionBag = Record<string, StudioPluginDefinition<PluginKind, unknown, unknown>>;

export type PluginOutput<TPlugin extends StudioPluginDefinition<PluginKind, unknown, unknown>> =
  TPlugin extends StudioPluginDefinition<PluginKind, unknown, infer TOutput> ? TOutput : never;

export type PluginInput<TPlugin extends StudioPluginDefinition<PluginKind, unknown, unknown>> =
  TPlugin extends StudioPluginDefinition<PluginKind, infer TInput, unknown> ? TInput : never;

export type PluginByKind<
  TDefinitions extends PluginDefinitionBag,
  TKind extends PluginKind,
> = {
  [K in keyof TDefinitions as TDefinitions[K] extends StudioPluginDefinition<TKind, unknown, unknown> ? K : never]: TDefinitions[K];
};

export interface StageEvent<TScope extends string, TKind extends string, TPayload = unknown> {
  readonly kind: EventName<TScope>;
  readonly stage: StageName;
  readonly eventKind: TKind;
  readonly payload: TPayload;
  readonly createdAt: string;
}

export interface RunEnvelope {
  readonly runId: RunId;
  readonly tenantId: TenantId;
  readonly status: StudioStatus;
  readonly span: StudioSpan;
  readonly steps: readonly string[];
}

export interface RunResult<TMetrics extends Record<string, number>> {
  readonly run: RunEnvelope;
  readonly metrics: TMetrics;
}

export type StageResult<TCurrent, TNext = TCurrent> = TCurrent extends PromiseLike<infer TResolved>
  ? PromiseLike<TNext & TResolved>
  : TNext;

export type UnwrapResult<TValue> = TValue extends { ok: true; value: infer T } ? TValue : ResultState<TValue, Error>;

export interface RunAuditRecord {
  readonly runId: RunId;
  readonly sessionId: SessionId;
  readonly steps: PageResult<string>;
}
