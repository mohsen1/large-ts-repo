import type { IncidentCriticality, OrchestrationPlanInput, SignalBuckets, SignalCategory } from './models';

export type NoInfer<T> = [T][T extends any ? 0 : never];

export type Brand<TValue, TMarker extends string> = TValue & {
  readonly __brand: TMarker;
};

export type NonEmptyArray<T> = readonly [T, ...T[]];

export type ReadonlyDeep<T> = T extends (...args: any[]) => any
  ? T
  : T extends Map<infer K, infer V>
    ? ReadonlyMap<K, V>
    : T extends Set<infer TItem>
      ? ReadonlySet<TItem>
      : T extends Date
        ? Readonly<T>
        : T extends Array<infer TItem>
          ? ReadonlyArray<ReadonlyDeep<TItem>>
          : T extends object
            ? { readonly [K in keyof T]: ReadonlyDeep<T[K]> }
            : T;

export type RequireAtLeastOne<TObject, TKeys extends keyof TObject = keyof TObject> = Pick<
  TObject,
  Exclude<keyof TObject, TKeys>
> &
  {
    [TKey in TKeys]-?: Required<Pick<TObject, TKey>> & Partial<TObject>;
  }[TKeys];

export type Merge<A, B> = Omit<A, keyof B> & B;

export type Entry<K extends PropertyKey, T> = { readonly [P in K]: T };

export type SpreadKeys<TLeft extends object, TRight extends object> = {
  [K in keyof TLeft | keyof TRight]: K extends keyof TRight
    ? TRight[K]
    : K extends keyof TLeft
      ? TLeft[K]
      : never;
};

export type RenameKeyByPrefix<TObject extends Record<string, unknown>, TPrefix extends string> = {
  [K in keyof TObject as K extends string ? `${TPrefix}${K}` : never]: TObject[K];
};

export type EventName<TChannel extends string, TCategory extends SignalCategory> = `${TChannel}::${TCategory}`;

export type Expandable<T> = T extends infer U ? { [K in keyof U]: U[K] } : never;

export type LiteralUnion<T extends string> = T | (string & {});

export type PrefixTupleValues<
  TPrefix extends string,
  TTuple extends readonly string[],
> = TTuple extends readonly [infer Head extends string, ...infer Tail extends readonly string[]]
  ? readonly [`${TPrefix}:${Head}`, ...PrefixTupleValues<TPrefix, Tail>]
  : readonly [];

export type MergeSignalsBySeverity<TInput extends Readonly<{ [K in IncidentCriticality]: number }>> = Expandable<
  {
    [Severity in keyof TInput as `${Extract<Severity, string>}_count`]: TInput[Severity];
  } & {
    readonly totalCount: TInput[keyof TInput] & number;
  }
>;

export type MetricsEnvelope = {
  readonly values: SignalBuckets;
  readonly tags: Record<string, string>;
  readonly context: {
    tenant: string;
    incident: string;
  };
};

export type InferMetricKey<T extends MetricsEnvelope> = T extends {
  readonly tags: Record<infer TKey, infer TValue>;
}
  ? TKey extends string
    ? TValue extends string
      ? TKey
      : never
    : never
  : never;

export type EnsureAtLeastOne<T> = keyof T extends never ? never : T;

export type Flatten<T> = T extends readonly [infer Head, ...infer Tail]
  ? Head | Flatten<Tail>
  : T extends readonly []
    ? never
    : never;

export type NormalizeInput<TInput> = TInput extends string | number | boolean | bigint | symbol | null | undefined
  ? TInput
  : NoInfer<ReadonlyDeep<TInput>>;

export type PathSegment = string | number;
export type DotPaths<
  T,
  TBase extends string = '',
  TDepth extends number = 4,
> = T extends Record<string, unknown>
  ? readonly [`${TBase}` | `${TBase}.${string}` & `${string}.${string}`, ...ReadonlyArray<string>]
  : readonly [];

type Decrement = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export type PathValue<T, TPath extends readonly PathSegment[]> = TPath extends readonly [infer Head, ...infer Tail]
  ? Head extends keyof T
    ? Tail extends readonly PathSegment[]
      ? PathValue<T[Head], Tail>
      : never
    : never
  : T;

export type NormalizePlanInput<T extends OrchestrationPlanInput> = NormalizeInput<T>;

export const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export const roundTo = (value: number, decimals = 3): number => {
  const precision = 10 ** decimals;
  return Math.round(value * precision) / precision;
};

export const asTuple = <T extends readonly unknown[]>(value: T): T => value;

export const inferRuntimeBrand = <T extends string>(value: T) => `runtime:${value}` as const;
