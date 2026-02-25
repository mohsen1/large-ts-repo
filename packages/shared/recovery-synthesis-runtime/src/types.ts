import type { Brand, NoInfer } from '@shared/type-level';

export type SynthesisTraceId = Brand<string, 'SynthesisTraceId'>;
export type SynthesisNamespace = `namespace:${string}`;
export type SynthesisPluginName = `plugin:${string}`;
export type StageName<T extends string = string> = `stage:${T}`;

export type PluginDependency<TName extends SynthesisPluginName = SynthesisPluginName> = TName;

export type SplitPath<TPath extends string> = TPath extends `${infer Head}.${infer Tail}`
  ? readonly [Head, ...SplitPath<Tail>]
  : readonly [TPath];

export type LastPathSegment<TPath extends string> = TPath extends `${infer _}.${infer Tail}`
  ? LastPathSegment<Tail>
  : TPath;

export type ReverseTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? readonly [...ReverseTuple<Tail>, Head]
  : readonly [];

export type FlattenTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? readonly [Head, ...FlattenTuple<Tail>]
  : readonly [];

export type TupleLength<T extends readonly unknown[]> = T['length'];

export type PathTuple<T extends Record<string, unknown>> = {
  [K in keyof T & string]: T[K] extends Record<string, unknown>
    ? readonly [K, ...PathTuple<T[K] & Record<string, unknown>>]
    : readonly [K];
}[keyof T & string];

export type KeyMappedRecord<T extends Record<string, unknown>> = {
  [K in keyof T & string as `cfg:${K}`]: T[K];
};

export type DeepReadonly<T> = T extends (...args: readonly unknown[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? readonly U[] extends T
      ? readonly DeepReadonly<U>[]
      : never
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

export interface PluginContext<TInput = unknown, TStage extends StageName = StageName> {
  readonly traceId: SynthesisTraceId;
  readonly plugin: SynthesisPluginName;
  readonly stage: TStage;
  readonly sequence: number;
  readonly startedAt: string;
  readonly input: NoInfer<TInput>;
  readonly metadata: KeyMappedRecord<Record<string, string>>;
}

export interface PluginOutput<TPayload = unknown> {
  readonly status: 'success' | 'warn' | 'skip' | 'error';
  readonly payload: DeepReadonly<TPayload>;
  readonly latencyMs: number;
  readonly artifacts: readonly string[];
  readonly messages: readonly string[];
  readonly next: readonly SynthesisPluginName[];
}

export interface PluginDefinition<
  TInput = unknown,
  TOutput = unknown,
  TName extends SynthesisPluginName = SynthesisPluginName,
  TStage extends StageName = StageName,
  TNamespace extends SynthesisNamespace = SynthesisNamespace,
> {
  readonly name: TName;
  readonly namespace: TNamespace;
  readonly stage: TStage;
  readonly dependsOn: readonly PluginDependency<TName>[];
  readonly description: string;
  readonly labels: KeyMappedRecord<{
    owner: string;
    criticality: 'low' | 'medium' | 'high' | 'critical';
  }>;
  readonly run: (
    input: NoInfer<TInput>,
    context: PluginContext<TInput, TStage>,
  ) => PromiseLike<PluginOutput<TOutput>>;
}

export type PluginNameUnion<TPlugins extends readonly PluginDefinition[]> = TPlugins[number]['name'];
export type PluginByName<TPlugins extends readonly PluginDefinition[], TName extends PluginNameUnion<TPlugins>> = Extract<
  TPlugins[number],
  { readonly name: TName }
>;
export type PluginMap<TPlugins extends readonly PluginDefinition[]> = {
  [K in PluginNameUnion<TPlugins>]: PluginByName<TPlugins, K>;
};

export type PluginByStage<TPlugins extends readonly PluginDefinition[], TStage extends StageName> = {
  [K in TPlugins[number] as K['stage'] extends TStage ? K['name'] : never]: K;
};

export interface SynthesisTelemetryFrame<TPayload = unknown> {
  readonly id: SynthesisTraceId;
  readonly at: string;
  readonly stage: StageName;
  readonly plugin: SynthesisPluginName;
  readonly payload: DeepReadonly<TPayload>;
  readonly latencyMs: number;
}

export type PipelineMode = 'online' | 'dry-run' | 'shadow';

export interface PipelineContext<TInput = unknown> {
  readonly traceId: SynthesisTraceId;
  readonly mode: PipelineMode;
  readonly stage: StageName;
  readonly startedAt: string;
  readonly input: NoInfer<TInput>;
  readonly metadata: KeyMappedRecord<Record<string, string>>;
}
