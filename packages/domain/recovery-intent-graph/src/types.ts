import type { Brand, JsonObject, NoInfer, PathTuple, RecursivePath } from '@shared/type-level';

export type TenantId = Brand<string, 'tenant'>;
export type OperatorId = Brand<string, 'operator'>;
export type IntentGraphId = Brand<string, 'graph'>;
export type IntentNodeId = Brand<string, `intent-node:${string}`>;
export type IntentRunId = Brand<string, `intent-run:${string}`>;
export type IntentSignalId = Brand<string, `signal:${string}`>;
export type IntentEdgeId = Brand<string, `edge:${string}`>;

export type IntentStage = 'capture' | 'normalize' | 'score' | 'recommend' | 'simulate' | 'resolve';
export type SignalMode = 'auto' | 'manual' | 'scheduled' | 'emergency';
export type IntentChannel = `${string}://intent.${string}`;
export type StageLabel<T extends IntentStage = IntentStage> = `${Uppercase<T>}_STAGE`;

export interface IntentNodePayload extends JsonObject {
  readonly kind: IntentStage;
  readonly weight: number;
}

export interface IntentNodeMetadata {
  readonly owner: OperatorId;
  readonly createdAt: Date;
  readonly labels: readonly string[];
  readonly labelsByStage: Readonly<Record<IntentStage, readonly string[]>>;
}

export interface IntentNodeConfig<TPayload extends IntentNodePayload = IntentNodePayload> {
  readonly graphId: IntentGraphId;
  readonly nodeId: IntentNodeId;
  readonly kind: IntentStage;
  readonly stageLabel: StageLabel<IntentStage>;
  readonly payload: TPayload;
  readonly timeoutMs: number;
  readonly retries: number;
  readonly metadata: IntentNodeMetadata;
}

export interface IntentInput {
  readonly graphId: IntentGraphId;
  readonly runId: IntentRunId;
  readonly tenant: TenantId;
  readonly signalId: IntentSignalId;
  readonly requestedBy: OperatorId;
  readonly mode: SignalMode;
}

export interface IntentOutput {
  readonly runId: IntentRunId;
  readonly graphId: IntentGraphId;
  readonly tenant: TenantId;
  readonly nodeId: IntentNodeId;
  readonly score: number;
  readonly elapsedMs: number;
  readonly recommendations: readonly string[];
}

export interface PluginExecutionContext<TPayload extends IntentNodePayload = IntentNodePayload> {
  readonly input: IntentInput;
  readonly node: IntentNodeConfig<TPayload>;
  readonly payload: Readonly<TPayload>;
  readonly abort: AbortSignal;
}

export type IntentExecutionContext<TPayload extends IntentNodePayload = IntentNodePayload> = PluginExecutionContext<TPayload>;

export interface PluginSuccess<TPayload extends IntentNodePayload = IntentNodePayload> {
  readonly ok: true;
  readonly output: IntentOutput & {
    readonly payload: Readonly<TPayload>;
  };
}

export interface PluginFailure {
  readonly ok: false;
  readonly error: {
    readonly message: string;
    readonly code: string;
  };
}

export type PluginResult<TPayload extends IntentNodePayload = IntentNodePayload> = PluginSuccess<TPayload> | PluginFailure;

export interface PluginContract<
  TKind extends IntentStage = IntentStage,
  TInput extends IntentNodePayload = IntentNodePayload,
  TOutput extends IntentNodePayload = IntentNodePayload,
> {
  readonly kind: TKind;
  readonly pluginId: Brand<string, `plugin:${TKind}`>;
  readonly capability: readonly IntentChannel[];
  readonly config: Record<string, unknown>;
  readonly weight: number;
  run(context: PluginExecutionContext<TInput>): Promise<PluginResult<TOutput>>;
}

export interface IntentPolicy<TCatalog extends readonly PluginContract<IntentStage, any, any>[]> {
  readonly id: IntentGraphId;
  readonly tenant: TenantId;
  readonly channel: IntentChannel;
  readonly steps: readonly IntentStage[];
  readonly plugins: TCatalog;
}

export interface IntentExecutionResult {
  readonly runId: IntentRunId;
  readonly graphId: IntentGraphId;
  readonly tenant: TenantId;
  readonly ok: boolean;
  readonly confidence: number;
  readonly recommendations: readonly string[];
}

export interface IntentTelemetry {
  readonly runId: IntentRunId;
  readonly graphId: IntentGraphId;
  readonly nodeId: IntentNodeId;
  readonly tenant: TenantId;
  readonly elapsedMs: number;
  readonly stageTimings: Readonly<Record<IntentStage, number>>;
}

export interface IntentRunEnvelope {
  readonly runId: IntentRunId;
  readonly graphId: IntentGraphId;
  readonly tenant: TenantId;
  readonly startedAt: Date;
}

export type EnsureNonEmpty<T extends readonly unknown[]> = T extends [] ? never : T;
export type Flatten<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Rest]
  ? [Head, ...Flatten<Rest>]
  : [];
export type ReverseTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Rest]
  ? [...ReverseTuple<Rest>, Head]
  : [];
export type Tail<T extends readonly unknown[]> = T extends readonly [unknown, ...infer Rest] ? Rest : [];
export type KeyRemap<T extends Record<string, unknown>> = {
  [K in keyof T as `intent_${string & K}`]: T[K];
};

export type PickInputByKind<TCatalog extends readonly PluginContract<IntentStage, any, any>[], TKind extends IntentStage> =
  Extract<TCatalog[number], { kind: TKind }> extends PluginContract<TKind, infer I, any> ? I : never;

export type PickOutputByKind<TCatalog extends readonly PluginContract<IntentStage, any, any>[], TKind extends IntentStage> =
  Extract<TCatalog[number], { kind: TKind }> extends PluginContract<TKind, any, infer O> ? O : never;

export type PluginBuckets<TCatalog extends readonly PluginContract<IntentStage, any, any>[]> = {
  [K in TCatalog[number] as K['kind']]: readonly Extract<TCatalog[number], { kind: K['kind'] }>[];
};

export type MergeRecursive<T extends readonly Record<string, unknown>[]> =
  T extends readonly [infer Head extends Record<string, unknown>, ...infer Rest extends readonly Record<string, unknown>[]]
    ? [Head, ...MergeRecursive<Rest>]
    : [];

export type TupleConcat<T extends readonly unknown[], U extends readonly unknown[]> = [...T, ...U];
export type DeepPath<T> = RecursivePath<T>;
export type PathValue<T, TPath extends string> = TPath extends DeepPath<T> ? string : string;
export type PolicyKindPaths<T extends IntentPolicy<readonly PluginContract[]>> = {
  [K in T['id']]: K extends IntentGraphId ? K : never;
};

export type InputCreateError = { readonly reason: 'invalid-tenant' | 'invalid-run' };

export const createTenantId = (value: string): TenantId => `tenant:${value}` as TenantId;
export const createOperatorId = (value: string): OperatorId => `operator:${value}` as OperatorId;
export const createGraphId = (value: string): IntentGraphId => `graph:${value}` as IntentGraphId;
export const createNodeId = (graphId: IntentGraphId, name: string): IntentNodeId =>
  `${graphId}:intent-node:${name}` as IntentNodeId;
export const createRunId = (value: string): IntentRunId => `intent-run:${value}` as IntentRunId;
export const createInputRunId = createRunId;
export const createSignalId = (value: string): IntentSignalId => `signal:${value}` as IntentSignalId;
export const createSignalEndpoint = (tenant: TenantId): IntentChannel => `ws://intent.${tenant}` as IntentChannel;
export const createEdgeId = (left: IntentNodeId, right: IntentNodeId): IntentEdgeId => `edge:${left}->${right}` as IntentEdgeId;

export const createInput = (
  value: Omit<IntentInput, 'runId'> & { readonly runId?: IntentRunId },
): IntentInput => {
  const runId = value.runId ?? createRunId(`manual-${Date.now()}`);
  return {
    ...value,
    runId,
  };
};

export const createPolicy = <T extends readonly PluginContract<IntentStage, any, any>[]>(
  value: {
    id: IntentGraphId;
    tenant: TenantId;
    channel: IntentChannel;
    steps: EnsureNonEmpty<readonly IntentStage[]>;
    plugins: NoInfer<T>;
  },
): IntentPolicy<T> => ({
  id: value.id,
  tenant: value.tenant,
  channel: value.channel,
  steps: value.steps,
  plugins: value.plugins,
});

export const createOutputWithPayload = <TInput extends IntentNodePayload, TOutput extends IntentNodePayload>(
  params: {
    input: IntentInput;
    nodeId: IntentNodeId;
    payload: Readonly<TOutput>;
    recommendations?: readonly string[];
  },
  score = 100,
  elapsedMs = 0,
): PluginResult<TOutput> => ({
  ok: true,
  output: {
    runId: params.input.runId,
    graphId: params.input.graphId,
    tenant: params.input.tenant,
    nodeId: params.nodeId,
    score,
    elapsedMs,
    recommendations: params.recommendations ?? ['default'],
    payload: params.payload,
  },
});

export const stageOrder = (
  ['capture', 'normalize', 'score', 'recommend', 'simulate', 'resolve'] as const
) satisfies readonly IntentStage[];

export type StageSequence = typeof stageOrder;

export const isFinalStage = (stage: IntentStage): boolean => stage === 'resolve';
