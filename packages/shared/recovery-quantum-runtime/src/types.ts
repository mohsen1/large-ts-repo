import type { Brand as BaseBrand } from '@shared/type-level';

export type Brand<T, B extends string> = BaseBrand<T, B>;

export type NoInfer<T> = [T][T extends any ? 0 : never];

export type Primitive = string | number | boolean | bigint | symbol | null | undefined;

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface JsonArray extends Array<JsonValue> {}

export type IdPrefix = `tenant:${string}` | `run:${string}` | `signal:${string}` | `node:${string}`;

export type BrandId<T extends string> = Brand<string, T>;

export type InferNodeId<T> = T extends { id: infer I } ? I : never;

export type InferUnionKind<T> = T extends { kind: infer K } ? K & string : never;

export type DeepReadonly<T> = T extends (...args: any[]) => any
  ? T
  : T extends Primitive
    ? T
    : T extends Array<infer U>
      ? ReadonlyArray<DeepReadonly<U>>
      : T extends object
        ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
        : T;

export type DeepWritable<T> = T extends Primitive
  ? T
  : T extends Array<infer U>
    ? DeepWritable<U>[]
    : T extends object
      ? { [K in keyof T]: DeepWritable<T[K]> }
      : T;

export type Shift<T extends readonly unknown[]> = T extends readonly [unknown, ...infer Rest] ? Rest : [];

export type Head<T extends readonly unknown[]> = T extends readonly [infer H, ...unknown[]]
  ? H
  : never;

export type Tail<T extends readonly unknown[]> = T extends readonly [unknown, ...infer Rest]
  ? Rest
  : readonly [];

export type Last<T extends readonly unknown[]> = T extends readonly [...unknown[], infer L]
  ? L
  : never;

export type RecursiveTuple<T, Length extends number, Acc extends readonly T[] = []> = Acc['length'] extends Length
  ? Acc
  : RecursiveTuple<T, Length, readonly [...Acc, T]>;

export type TupleJoin<T extends readonly unknown[]> = T extends readonly [infer H, ...infer R]
  ? R['length'] extends 0
    ? `${H & string}`
    : `${H & string}.${TupleJoin<R & readonly string[]>}`
  : never;

export type StripMetaKeys<T extends Record<string, unknown>> = {
  [K in keyof T as K extends `__${string}` ? never : K]: T[K] extends Record<string, unknown>
    ? StripMetaKeys<T[K] & Record<string, unknown>>
    : T[K] extends readonly (infer U)[]
      ? readonly U[]
      : T[K];
};

export type RenameKeys<T extends Record<string, unknown>> = {
  [K in keyof T as K extends `${string}Id` ? `identity:${K & string}` : `meta:${K & string}`]: T[K];
};

export type KeyPath<T, Prefix extends string = ''> = T extends Primitive
  ? never
  : T extends Array<infer U>
    ? `${Prefix}[${number}]${U extends Primitive ? '' : `.${KeyPath<U, ''>}`}`
    : {
        [K in keyof T & string]: T[K] extends Primitive
          ? `${Prefix}${K}`
          : T[K] extends Array<infer U>
            ? `${Prefix}${K}[${number}]${U extends Primitive ? '' : `.${KeyPath<U, ''>}`}`
            : `${Prefix}${K}` | `${Prefix}${K}.${KeyPath<T[K], `${Prefix}${K}.`>}`;
      }[keyof T & string];

export type ValueAtPath<T, Path extends string> = Path extends `${infer Head}.${infer Tail}`
  ? Head extends keyof T
    ? ValueAtPath<T[Head], Tail>
    : unknown
  : Path extends `${infer Head}[${string}]`
    ? Head extends keyof T
      ? T[Head] extends ReadonlyArray<infer Item>
        ? Item
        : unknown
      : unknown
    : Path extends keyof T
      ? T[Path]
      : unknown;

export type Merge<A, B> = Omit<A, keyof B> & B;

export type MergeDeep<A, B> = A extends Primitive
  ? B
  : B extends Primitive
    ? B
    : {
        [K in keyof (A & B)]: K extends keyof B
          ? K extends keyof A
            ? MergeDeep<A[K], B[K]>
            : B[K]
          : K extends keyof A
            ? A[K]
            : never;
      };

export type EnsureTuple<T> = T extends readonly any[] ? T : [T];

export type RouteLabel<T extends string, Segment extends string> = `${T}::${Segment}`;

export type Expand<T> = T extends Function ? T : { [K in keyof T]: T[K] } & {};

export interface Disposable {
  [Symbol.dispose](): void;
}

export interface AsyncDisposable {
  [Symbol.asyncDispose](): PromiseLike<void> | void;
}

export const isJsonObject = (value: JsonValue): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export type FlattenEntries<T> = T extends readonly [infer H, ...infer R]
  ? H | FlattenEntries<R>
  : never;

export type EventNamePrefix<T extends string> = `${T}:`;

export type RoutedEvent<
  Namespace extends string,
  Channel extends string,
  Direction extends 'ingress' | 'egress',
> = `${Namespace}/${Channel}:${Direction}`;

export type MaybePromise<T> = T | Promise<T>;

export type AwaitedLike<T> = T extends PromiseLike<infer U> ? AwaitedLike<U> : T;

export type Identity<T> = T & {};

export type NoNever<T> = {
  [K in keyof T as T[K] extends never ? never : K]: T[K];
};

export interface Cursor<T> {
  readonly value: T;
  readonly atEnd: boolean;
}

export interface PluginMetadata<TKind extends string> {
  readonly kind: TKind;
  readonly namespace: string;
  readonly version: RouteLabel<'v', `${number}.${number}`>;
}

export interface PluginPayload<TKind extends string, TData> {
  readonly kind: TKind;
  readonly data: DeepReadonly<TData>;
}
