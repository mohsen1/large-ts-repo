import type { Brand } from '@shared/core';

export type NoInfer<T> = [T][T extends unknown ? 0 : never];

export type Branded<T, TBrand extends string> = Brand<T, TBrand>;

export type RecursiveTuple<T, Depth extends number, Prefix extends T[] = []> = Prefix['length'] extends Depth
  ? Prefix
  : RecursiveTuple<T, Depth, [...Prefix, T]>;

export type Head<T extends readonly unknown[]> = T extends readonly [infer H, ...unknown[]] ? H : never;

export type Tail<T extends readonly unknown[]> = T extends readonly [unknown, ...infer Rest] ? Rest : [];

export type Last<T extends readonly unknown[]> = T extends readonly [...unknown[], infer L] ? L : never;

export type Prepend<T extends unknown[], U> = readonly [U, ...T];

export type Pair<A, B> = readonly [A, B];

export type Zip<T extends readonly unknown[], U extends readonly unknown[]> = T extends readonly [
  infer TH,
  ...infer TT
]
  ? U extends readonly [infer UH, ...infer UT]
    ? readonly [readonly [TH, UH], ...Zip<TT, UT>]
    : readonly []
  : readonly [];

export type BuildPathSegments<T extends string> = T extends `${infer First}/${infer Rest}`
  ? readonly [First, ...BuildPathSegments<Rest>]
  : readonly [T];

export type JoinPath<T extends readonly string[]> = T extends readonly [infer First, ...infer Rest]
  ? First extends string
    ? Rest extends readonly string[]
      ? Rest extends []
        ? First
        : `${First}/${JoinPath<Rest>}`
      : never
    : never
  : '';

export type JsonPrimitive = string | number | boolean | null | bigint;
export type JsonContainer = JsonValue[] | { [key: string]: JsonValue };
export type JsonValue = JsonPrimitive | JsonContainer | undefined;

export type DeepReadonly<T> = T extends (...args: unknown[]) => unknown
  ? T
  : T extends readonly (infer E)[]
    ? readonly DeepReadonly<E>[]
    : T extends ReadonlyMap<infer K, infer V>
      ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
      : T extends ReadonlySet<infer V>
        ? ReadonlySet<DeepReadonly<V>>
        : T extends object
          ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
          : T;

export type OptionalKeys<T> = {
  [K in keyof T]-?: undefined extends T[K] ? K : never;
}[keyof T];

export type RequiredKeys<T> = {
  [K in keyof T]-?: undefined extends T[K] ? never : K;
}[keyof T];

export type ReplaceKey<T, K extends keyof T, V> = Omit<T, K> & { [P in K]: V };

export type NormalizeTuple<T extends readonly unknown[]> = { [K in keyof T]: T[K] };

export type EventName<
  TDomain extends string,
  TVerb extends string
> = `${TDomain}/${TVerb}`;

export type MappedEvents<T extends Record<string, string>> = {
  [K in keyof T as K extends string ? `event:${K}` : never]: T[K];
};
