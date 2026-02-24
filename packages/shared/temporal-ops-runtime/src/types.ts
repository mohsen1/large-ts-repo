import { z } from 'zod';

export type Brand<T, TBrand extends string> = T & { readonly __brand: TBrand };
export type EntityId = Brand<string, 'EntityId'>;
export type TenantId = Brand<string, 'TenantId'>;
export type RunId = Brand<string, 'RunId'>;
export type StageId = Brand<string, 'TemporalStageId'>;
export type IsoTimestamp = Brand<string, 'IsoTimestamp'>;

export type NoInfer<T> = [T][T extends unknown ? 0 : never];

export type Primitive = string | number | boolean | bigint | symbol | null | undefined;
export type ToBrand<T extends string> = T & { readonly __eventType: never };

export type RouteSegments<T extends string> = T extends `${infer Head}/${infer Tail}`
  ? [Head, ...RouteSegments<Tail>]
  : [T];

export type NormalizeEventName<TName extends string> = `temporal:${Lowercase<TName>}`;

export interface TemporalEnvelope<TKind extends string, TPayload, TCorrelation extends string = string> {
  readonly kind: NormalizeEventName<TKind>;
  readonly correlationId: Brand<TCorrelation, 'CorrelationId'>;
  readonly at: IsoTimestamp;
  readonly payload: TPayload;
}

export type EventMapEntry<TKind extends string, TPayload> = {
  kind: NormalizeEventName<TKind>;
  payload: TPayload;
};

export type EventCatalog<TMap extends Record<string, unknown>> = {
  [K in keyof TMap & string]: EventMapEntry<K, TMap[K]>;
}[keyof TMap & string];

export type PayloadByKind<TCatalog extends Record<string, unknown>, TKind extends string> =
  Extract<TCatalog, { kind: NormalizeEventName<TKind> }>['payload'];

export interface StageMetadata {
  readonly id: StageId;
  readonly description: string;
  readonly tags: ReadonlySet<string>;
  readonly sequence: number;
}

export interface StageResult<TValue> extends StageMetadata {
  readonly value: TValue;
  readonly producedAt: IsoTimestamp;
  readonly diagnostics: readonly string[];
}

export type InferPromise<T> = T extends Promise<infer TResolved> ? TResolved : T;

export type Normalize<TModel> = {
  [K in keyof TModel]: TModel[K];
} & {};

export type RecursiveDepthTuple<TItem, TDepth extends number, TResult extends readonly TItem[] = readonly []> =
  TDepth extends 0
    ? TResult
    : RecursiveDepthTuple<TItem, Decrement<TDepth>, readonly [...TResult, TItem]>;

type BuildTuple<TCount extends number, TResult extends readonly unknown[] = readonly []> =
  TResult['length'] extends TCount ? TResult : BuildTuple<TCount, readonly [...TResult, unknown]>;

export type Decrement<TValue extends number> = BuildTuple<TValue> extends readonly [unknown, ...infer Tail]
  ? Tail['length']
  : never;

export type PickPath<TObj, TPath extends string> = TPath extends `${infer Head}.${infer Rest}`
  ? Head extends keyof TObj
    ? PickPath<TObj[Head], Rest>
    : unknown
  : TPath extends keyof TObj
    ? TObj[TPath]
    : unknown;

export type KeysStartingWith<TValue, TPrefix extends string> = {
  [K in keyof TValue & string as K extends `${TPrefix}${string}` ? K : never]: TValue[K];
};

export type MergeWithPrefix<TKey extends string, TValue> = {
  [K in keyof TValue & string as `${TKey}.${K}`]: TValue[K];
};

export type ExpandVariants<TValue> = TValue extends Record<string, infer Next>
  ? {
      [K in keyof TValue]: ExpandVariants<TValue[K]>;
    } & {}
  : TValue;

export type RecursivePick<TValue, TIncludes extends readonly string[]> =
  TIncludes extends readonly [infer THead & string, ...infer TTail extends readonly string[]]
    ? THead extends keyof TValue & string
      ? { readonly [K in THead]: TValue[K] } & RecursivePick<TValue[THead], TTail>
      : {}
    : {};

export type NonEmptyTuple<TItem> = readonly [TItem, ...TItem[]];

export interface TemporalArtifact<TPayload> {
  readonly name: string;
  readonly slug: ToBrand<string>;
  readonly schema: z.ZodType<TPayload>;
}

export type StageTuple = readonly [StageMetadata, ...readonly StageMetadata[]];

export type ComposeTuples<T extends readonly unknown[][]> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends readonly unknown[]
    ? Tail extends readonly unknown[][]
      ? [...Head, ...ComposeTuples<Tail>]
      : Head
    : []
  : [];

export interface TemporalQueryOptions {
  readonly includeDiagnostics?: boolean;
  readonly includeHistory?: boolean;
  readonly limit?: number;
}

export type ConstrainedRecord<TValue> = Record<string, TValue>;

export const isoNow = (): IsoTimestamp => new Date().toISOString() as IsoTimestamp;
export const asTenantId = (value: string): TenantId => value as TenantId;
export const asEntityId = <TInput extends string>(value: TInput): EntityId => `ent:${value}` as EntityId;
export const asRunId = (tenant: string, seed: string): RunId => `run:${tenant}:${seed}` as RunId;
export const asStageId = (runId: RunId, stage: string): StageId => `${runId}:${stage}` as StageId;
export const asFlowNodeId = (scope: string, seed: string): Brand<string, 'FlowNode'> =>
  `${scope}:${seed}` as Brand<string, 'FlowNode'>;

export const isTemporalKind = <TKind extends string>(value: string, kind: TKind): value is NormalizeEventName<TKind> => {
  return value.startsWith('temporal:') && value.endsWith(kind.toLowerCase());
};
