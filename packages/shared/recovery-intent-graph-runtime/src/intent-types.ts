import type { Brand, AsyncTask } from '@shared/type-level';

export type NoInfer<T> = [T][T extends any ? 0 : never];

export type PathSegment = string & { readonly __pathSegment: unique symbol };
export type PathLike = readonly string[];

export type RecursivePathUnion<TParts extends PathLike> = TParts extends readonly [
  infer THead extends string,
  ...infer TTail extends PathLike,
]
  ? TTail extends readonly []
    ? THead
    : `${THead}` | `${THead}.${RecursivePathUnion<TTail>}`
  : never;

export type TupleOf<
  TType,
  TSize extends number,
  TAcc extends readonly TType[] = readonly [],
> = TAcc['length'] extends TSize
  ? TAcc
  : TupleOf<TType, TSize, readonly [...TAcc, TType]>;

export type EventBusRoute<TPrefix extends string, TSegments extends PathLike> = TPrefix extends string
  ? `${TPrefix}:${RecursivePathUnion<TSegments>}`
  : never;

export type RouteMap<T extends Record<string, Record<string, unknown>>> = {
  [K in keyof T as K extends string ? `${K}:route` : never]: {
    readonly path: K;
    readonly payload: T[K];
  };
};

export type InferRoutePayload<
  TRouteMap extends Record<string, { path: string; payload: Record<string, unknown> }>,
  TRoute extends keyof TRouteMap & string,
> = TRouteMap[TRoute]['payload'];

export type Merge<TBase, TOverlay> = Omit<TBase, keyof TOverlay> & TOverlay;

export interface IntentSpan<TState extends string = string> {
  readonly fromMs: number;
  readonly toMs: number;
  readonly state: TState;
}

export interface IntentMetric<TKey extends string = string, TValue = unknown> {
  readonly key: TKey;
  readonly value: TValue;
  readonly atMs: number;
}

export interface IntentSignal {
  readonly tenant: Brand<string, 'tenant'>;
  readonly workspace: Brand<string, 'workspace'>;
  readonly eventType: string;
  readonly confidence: number;
  readonly metadata: Record<string, unknown>;
}

export interface IntentInput<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
  TRoute extends string = string,
> {
  readonly kind: TRoute;
  readonly payload: TPayload;
}

export type IntentOutput<TPayload> = {
  readonly output: TPayload;
  readonly emittedSignals: readonly IntentSignal[];
  readonly runtimeMs: number;
};

export interface IntentPluginContext<TScope extends string = string> {
  readonly tenant: Brand<string, 'tenant'>;
  readonly workspace: Brand<string, 'workspace'>;
  readonly scope: TScope;
  readonly traceId: string;
  readonly requestId: string;
  readonly startedAt: number;
}

export interface PluginDescriptor<
  TName extends string,
  TInput extends IntentInput = IntentInput,
  TOutput = unknown,
  TRoute extends string = string,
  TKind extends string = string,
> {
  readonly pluginId: Brand<string, 'IntentPluginId'>;
  readonly pluginName: TName;
  readonly route: TRoute;
  readonly kind: TKind;
  readonly dependencies: readonly Brand<string, 'IntentPluginId'>[];
  readonly input: TInput;
  readonly outputExample?: TOutput;
  canRun(context: IntentPluginContext<TRoute>): boolean;
  run(input: TInput, context: IntentPluginContext<TRoute>): Promise<IntentOutput<TOutput>> | IntentOutput<TOutput>;
  readonly metadata?: Record<string, unknown>;
}

export type PluginByRoute<
  TDescriptors extends readonly PluginDescriptor<string, IntentInput, unknown, string, string>[],
  TRoute extends TDescriptors[number]['route'],
> = Extract<TDescriptors[number], { route: TRoute }>;

export type PluginByName<
  TDescriptors extends readonly PluginDescriptor<string, IntentInput, unknown, string, string>[],
  TName extends TDescriptors[number]['pluginName'],
> = Extract<TDescriptors[number], { pluginName: TName }>;

export type PluginInputByRoute<
  TDescriptors extends readonly PluginDescriptor<string, IntentInput, unknown, string, string>[],
  TRoute extends TDescriptors[number]['route'],
> = PluginByRoute<TDescriptors, TRoute>['input'];

export type RouteOutput<
  TDescriptors extends readonly PluginDescriptor<string, IntentInput, unknown, string, string>[],
  TRoute extends TDescriptors[number]['route'],
> = PluginByRoute<TDescriptors, TRoute> extends PluginDescriptor<
  string,
  infer TInput,
  infer TOutput,
  TRoute,
  string
>
  ? IntentOutput<TOutput>
  : never;

export type PluginName<TDescriptor> = TDescriptor extends { pluginName: infer TName } ? TName : never;

export type Guarded<T extends Record<string, unknown>, TFilter extends Record<string, unknown>> = {
  [K in keyof T as K extends keyof TFilter ? K : never]: T[K];
};

export interface IntentGraphTask<I extends IntentInput = IntentInput, O = unknown> extends AsyncTask<I, O> {
  readonly id: Brand<string, 'EntityId'>;
  readonly path: RecursivePathUnion<['graph', 'intention', 'route']>;
}

export type FlattenRecursive<
  TCollection extends readonly unknown[],
  TAcc extends readonly unknown[] = readonly [],
> = TCollection extends readonly [infer THead, ...infer TTail]
  ? THead extends readonly unknown[]
    ? FlattenRecursive<TTail, readonly [...TAcc, ...THead]>
    : FlattenRecursive<TTail, readonly [...TAcc, THead]>
  : TAcc;

export type BrandedRoute = `${string}::${string}`;

export const isRouteMatch = (route: string, prefix: string): boolean => route === prefix || route.startsWith(`${prefix}:`);

export const asIntentRoute = <TRoute extends string>(route: TRoute): BrandedRoute => route as BrandedRoute;

export const makeIntentSpan = <TState extends string>(span: IntentSpan<TState>): IntentSpan<TState> => ({ ...span });

export const signalToRecord = (signal: IntentSignal): Record<string, unknown> => ({
  tenant: signal.tenant,
  workspace: signal.workspace,
  eventType: signal.eventType,
  confidence: signal.confidence,
  ...signal.metadata,
});

export const makeIntentTenant = (tenant: string): Brand<string, 'tenant'> => tenant as Brand<string, 'tenant'>;
export const makeIntentWorkspace = (workspace: string): Brand<string, 'workspace'> => workspace as Brand<string, 'workspace'>;
