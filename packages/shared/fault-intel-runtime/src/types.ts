export type Brand<T, TBrand extends string> = T & {
  readonly __brand: `FaultIntel:${TBrand}`;
};

export type NoInfer<T> = [T][T extends never ? never : 0];

export type Primitive = string | number | boolean | bigint | symbol | null | undefined;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;
export interface JsonObject {
  readonly [key: string]: JsonValue;
}
export interface JsonArray extends Array<JsonValue> {}

export type AwaitedLike<T> = T extends PromiseLike<infer U> ? AwaitedLike<U> : T;

export type NonNullableRecursive<T> = T extends undefined | null ? never : T;

export type RecursiveTuple<T extends readonly unknown[]> = T extends readonly [
  infer Head,
  ...infer Tail
]
  ? readonly [NonNullableRecursive<Head>, ...RecursiveTuple<Tail>]
  : readonly [];

export type TupleConcat<T extends readonly unknown[], U extends readonly unknown[]> = readonly [...T, ...U];

export type Repeat<T, N extends number, Acc extends readonly T[] = readonly []> = Acc['length'] extends N
  ? Acc
  : Repeat<T, N, readonly [...Acc, T]>;

export type KeyRemap<T extends Record<string, unknown>, Prefix extends string> = {
  [K in keyof T as K extends string ? `${Prefix}:${K}` : never]: T[K];
};

export type Expand<T> = T extends (...args: never[]) => unknown ? T : { [K in keyof T]: T[K] };

export type DeepReadonly<T> = T extends Primitive
  ? T
  : T extends ReadonlyArray<infer U>
    ? readonly DeepReadonly<U>[]
    : T extends Array<infer U>
      ? readonly DeepReadonly<U>[]
      : T extends object
        ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
        : T;

export type Merge<A, B> = Omit<A, keyof B> & B;

export type DeepMerge<A, B> = A extends Primitive
  ? B
  : B extends Primitive
    ? B
    : A extends ReadonlyArray<infer AItem>
      ? B extends ReadonlyArray<infer BItem>
        ? readonly (AItem | BItem)[]
        : B
      : {
          [K in keyof A | keyof B]: K extends keyof B
            ? K extends keyof A
              ? DeepMerge<A[K], B[K]>
              : B[K]
            : K extends keyof A
              ? A[K]
              : never;
        };

export type MergeMaps<
  T extends Record<string, readonly string[]>,
  K extends keyof T
> = {
  [P in K as P extends string ? `${P}::map` : never]: T[P];
};

export type InvertTuple<T extends readonly string[]> = T extends readonly [
  infer Head extends string,
  ...infer Tail extends readonly string[]
]
  ? readonly [Head, ...InvertTuple<Tail>]
  : readonly [];

export type EventName<
  Namespace extends string,
  Kind extends string,
  Action extends string = 'observed'
> = `${Namespace}:${Kind}:${Action}`;

export type TemplatePath<Parts extends readonly string[]> = Parts extends readonly [
  infer Head extends string,
  ...infer Tail extends readonly string[]
]
  ? Tail extends readonly []
    ? Head
    : `${Head}/${TemplatePath<Tail>}`
  : never;

export type InferEventSource<T> = T extends EventEnvelope<infer S, any, any> ? S : never;

export interface EventEnvelope<Source extends string, Kind extends string, Payload = unknown> {
  readonly source: Source;
  readonly kind: Kind;
  readonly type: EventName<Source, Kind>;
  readonly payload: Payload;
  readonly createdAt: string;
}

export interface PluginContext {
  readonly tenantId: string;
  readonly namespace: string;
  readonly tags: ReadonlySet<string>;
  readonly timestamp: string;
}

export interface PluginDiagnostics {
  readonly pluginId: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationMs: number;
  readonly succeeded: boolean;
}

export interface FaultIntelPlugin<
  TContext extends PluginContext,
  TInput,
  TOutput,
  TConfig = unknown
> {
  readonly id: Brand<string, 'FaultIntelPluginId'>;
  readonly stage: Brand<string, 'FaultIntelStage'>;
  readonly priority: number;
  readonly supports: readonly string[];
  readonly config: TConfig;
  configure(context: TContext, config: NoInfer<TConfig>): TContext;
  execute(context: TContext, input: TInput): Promise<TOutput> | TOutput;
}

export type PluginOutput<TPlugin extends FaultIntelPlugin<any, any, any, any>> = TPlugin extends
  FaultIntelPlugin<any, any, infer Output, any> ? Output : never;

export type PluginInput<TPlugin extends FaultIntelPlugin<any, any, any, any>> = TPlugin extends
  FaultIntelPlugin<any, infer Input, any, any> ? Input : never;

export interface PluginInvocation<TContext extends PluginContext, TInput, TOutput> {
  readonly pluginId: string;
  readonly context: TContext;
  readonly input: TInput;
  readonly output: TOutput;
  readonly elapsedMs: number;
}

export interface AsyncScope {
  [Symbol.asyncDispose](): Promise<void>;
}
