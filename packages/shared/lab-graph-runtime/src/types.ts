export type Brand<T, Tag extends string> = T & { readonly __brand: Tag };

export type NoInfer<T> = [T][T extends unknown ? 0 : never];

export type PrimitiveValue = string | number | boolean | bigint | symbol | null | undefined;

export type DeepReadonly<T> = T extends (...args: any[]) => any
  ? T
  : T extends PrimitiveValue
    ? T
    : T extends Array<infer U>
      ? ReadonlyArray<DeepReadonly<U>>
      : T extends object
        ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
        : T;

export type DeepWritable<T> = T extends (...args: any[]) => any
  ? T
  : T extends PrimitiveValue
    ? T
    : T extends ReadonlyArray<infer U>
      ? U[]
      : T extends Array<infer U>
        ? DeepWritable<U>[]
        : T extends object
          ? { -readonly [K in keyof T]: DeepWritable<T[K]> }
          : T;

export type NonEmptyTuple<T> = [T, ...T[]];

export type Optionalize<T, K extends keyof T> = Omit<T, K> & { [P in K]?: T[P] };

export type ReplacePath<TRecord extends Record<string, unknown>, Prefix extends string> = {
  [K in keyof TRecord as `${Prefix}.${K & string}`]: TRecord[K];
};

export type Merge<A, B> = Omit<A, keyof B> & B;

export type PathValue<T, P extends string> =
  P extends `${infer Head}.${infer Rest}`
    ? Head extends keyof T
      ? PathValue<T[Head], Rest>
      : never
    : P extends keyof T
      ? T[P]
      : never;

export type RecursiveKeys<T> =
  T extends PrimitiveValue
    ? never
    : T extends readonly (infer U)[]
      ? RecursiveKeys<U> extends never
        ? `${number}`
        : `${number}` | `${number}.${RecursiveKeys<U>}`
      : T extends object
        ? {
            [K in keyof T & string]:
              RecursiveKeys<T[K]> extends never ? K : `${K}` | `${K}.${RecursiveKeys<T[K]>}`;
          }[keyof T & string]
        : never;

export type PluckTuple<T extends readonly unknown[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? [Head, ...PluckTuple<Tail>]
    : [];

export type RouteNode = Brand<string, 'route-node'>;
export type RunId = Brand<string, 'run-id'>;
export type GraphNodeId = Brand<string, 'graph-node-id'>;
export type PluginId = Brand<string, 'graph-plugin-id'>;

export const makePluginId = (seed: string): PluginId => `${seed}` as PluginId;

export type RoutePath<T extends readonly string[]> = T extends readonly [infer Head extends string, ...infer Tail extends string[]]
  ? Tail extends readonly []
    ? Head
    : `${Head}/${RoutePath<Tail>}`
  : never;

export type Chain<
  T extends readonly unknown[],
  TSeparator extends string,
> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends string
    ? Tail['length'] extends 0
      ? Head
      : `${Head}${TSeparator}${Chain<Tail, TSeparator>}`
    : never
  : never;

export type Fold<T extends readonly unknown[], Fallback> = T extends readonly [infer Head, ...infer Tail]
  ? Tail extends readonly []
    ? Head
    : `${Fallback & string}${Head & string}`
  : Fallback;

export interface TimeWindow {
  readonly startedAt: number;
  readonly endedAt?: number;
}

export interface ExecutionSnapshot {
  readonly runId: RunId;
  readonly window: TimeWindow;
  readonly tags: ReadonlySet<string>;
  readonly phase: string;
  readonly completed: number;
  readonly total: number;
}

export interface PluginSignal {
  readonly plugin: PluginId;
  readonly phase: string;
  readonly value: number;
  readonly timestamp: number;
}

export interface PluginRunMetadata<TInput> {
  readonly name: string;
  readonly input: TInput;
  readonly startedAt: number;
}

export interface PluginOutput<TOutput> {
  readonly plugin: PluginId;
  readonly output: TOutput;
  readonly durationMs: number;
}

export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };
export type Success<T> = Extract<Result<T>, { ok: true }>;
export type FailureResult<T, E> = Extract<Result<T, E>, { ok: false }>;

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const fail = <E = Error>(error: E): Result<never, E> => ({ ok: false, error });

export const isSuccess = <T>(value: Result<T>): value is Success<T> => value.ok;

export const mapResult = <T, U>(value: Result<T>, mapper: (value: T) => U): Result<U> =>
  value.ok ? ok(mapper(value.value)) : value;

export const collectFailures = <T, E>(values: readonly Result<T, E>[]): E[] =>
  values.filter((value): value is FailureResult<T, E> => !value.ok).map((value) => value.error);

export const ratio = (completed: number, total: number): number => (total > 0 ? completed / total : 0);

export const safePercent = (value: number): number => Math.max(0, Math.min(1, value));

export const range = (endExclusive: number): number[] =>
  Array.from({ length: endExclusive }, (_, index) => index);

export const chunkArray = <T>(values: readonly T[], chunkSize: number): readonly T[][] => {
  if (chunkSize <= 0) return [];
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    output.push(Array.from(values.slice(index, index + chunkSize)));
  }
  return output;
};

export const asRoutePath = <TParts extends readonly string[]>(
  ...parts: TParts
): RoutePath<TParts> => parts.filter(Boolean).join('/') as RoutePath<TParts>;

export const withFallback = <T,>(value: T | undefined, fallback: T): T => value ?? fallback;

export const dedupeByKey = <T, K extends string & keyof T>(items: readonly T[], key: K): T[] => {
  const map = new Map<T[K], T>();
  for (const item of items) map.set(item[key], item);
  return [...map.values()];
};

export const hasValue = <T>(value: T): value is NonNullable<T> => value != null;
