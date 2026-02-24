import type { Brand } from './brands';

export type BlueprintToken<TToken extends string = string> = `blueprint:${TToken}`;
export type EventToken<TName extends string = string> = `event:${TName}`;
export type TraceId = Brand<string, 'TraceId'>;
export type ResourceId = Brand<string, 'ResourceId'>;

export type RouteSegment = string & {};
export type RoutePath<TSegments extends readonly RouteSegment[]> = TSegments extends readonly [
  infer Head extends RouteSegment,
  ...infer Rest extends RouteSegment[],
]
  ? `${Head}${Rest['length'] extends 0 ? '' : '/'}${RoutePath<Rest>}`
  : never;

export type ValueOf<T> = T[keyof T];

export type IsNever<T> = [T] extends [never] ? true : false;
export type IsAny<T> = 0 extends 1 & T ? true : false;

export type IsUnion<T, TAll = T> = T extends TAll ? (TAll extends T ? false : true) : false;
export type If<TCondition extends boolean, TTrue, TFalse> = TCondition extends true ? TTrue : TFalse;

type BuildTuple<TLength extends number, TTuple extends readonly unknown[] = []> =
  TTuple['length'] extends TLength ? TTuple : BuildTuple<TLength, readonly [unknown, ...TTuple]>;
export type Decrement<TCount extends number> = BuildTuple<TCount> extends readonly [unknown, ...infer Tail] ? Tail['length'] : never;

export type RecursiveTuple<
  TValue,
  TDepth extends number,
  TOutput extends readonly TValue[] = readonly [],
> = TDepth extends 0 ? TOutput : RecursiveTuple<TValue, Decrement<TDepth>, readonly [...TOutput, TValue]>;

export type TupleTake<
  TTuple extends readonly unknown[],
  TCount extends number,
  TOutput extends readonly unknown[] = readonly [],
> = TTuple extends readonly [infer Head, ...infer Tail]
  ? TOutput['length'] extends TCount
    ? TOutput
    : TupleTake<Tail, TCount, readonly [...TOutput, Head]>
  : TOutput;

export type RecursiveMap<T> = T extends readonly [infer Head, ...infer Tail]
  ? readonly [TRecursiveMapEntry<Head>, ...RecursiveMap<Tail>]
  : readonly [];
type TRecursiveMapEntry<TValue> = TValue extends Record<string, unknown> ? { readonly [K in keyof TValue]: TValue[K] } : TValue;

export type KeyByType<TItem extends readonly unknown[], TType> = {
  [K in keyof TItem]: TItem[K] extends TType ? K : never;
}[number];

export type EventCatalogByName<TEventMap extends Record<string, unknown>> = {
  [K in keyof TEventMap & string]: {
    readonly kind: EventToken<K>;
    readonly name: K;
    readonly payload: TEventMap[K];
  };
}[keyof TEventMap & string];

export type EventPayload<TCatalog extends Record<string, unknown>, TKind extends keyof TCatalog & string> =
  Extract<EventCatalogByName<TCatalog>, { kind: EventToken<TKind> }>['payload'];

export type EventUnion<TCatalog extends Record<string, unknown>> = {
  [K in keyof TCatalog & string]: {
    readonly kind: EventToken<K>;
    readonly payload: TCatalog[K];
    readonly namespace: `namespace:${K}`;
    readonly eventId: ResourceId;
    readonly createdAt: string;
  };
}[keyof TCatalog & string];

export type CatalogEventEnvelope<TCatalog extends Record<string, unknown>> = {
  [K in keyof TCatalog & string]: Extract<EventUnion<TCatalog>, { kind: EventToken<K> }>;
}[keyof TCatalog & string];

export type Normalize<TValue> = {
  [K in keyof TValue]: TValue[K];
} & {};

export type RequiredByPrefix<TValue, TPrefix extends string> = {
  [K in keyof TValue as K extends `${TPrefix}.${string}` ? K : never]-?: TValue[K];
};

export type ExpandWithPrefix<
  TRecord extends Record<string, unknown>,
  TPrefix extends string,
> = {
  [K in keyof TRecord & string as `${TPrefix}:${K}`]: TRecord[K];
};

export type RouteLeaf<TPath extends string> = TPath extends `${infer Head}/${infer Tail}`
  ? RouteLeaf<Tail> | Head
  : TPath;

export type PathFor<TRecord extends Record<string, unknown>, TPrefix extends string = ''> = {
  [K in keyof TRecord & string]: TRecord[K] extends Record<string, unknown>
    ? TPrefix extends ''
      ? `${K}` | `${K}/${PathFor<TRecord[K], `${K}/`>}`
      : `${TPrefix}${K}` | `${TPrefix}${K}/${PathFor<TRecord[K], `${TPrefix}${K}/`>}`
    : TPrefix extends ''
      ? `${K}`
      : `${TPrefix}${K}`;
}[keyof TRecord & string];

export const pathToKey = <TPath extends string>(...parts: readonly string[]): TPath =>
  parts.join('/') as TPath;

export const normalizeRoute = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/\/{2,}/g, '/')
    .replace(/(^\/|\/$)/g, '');

export const makeBlueprint = <T extends string>(value: T): BlueprintToken<T> => `blueprint:${value}` as BlueprintToken<T>;
export const makeEvent = <T extends string>(value: T): EventToken<T> => `event:${value}` as EventToken<T>;

export const makeTraceId = (seed: string): TraceId =>
  `${seed}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 11)}` as TraceId;

export function ensureArray<T>(value: T): readonly T[];
export function ensureArray<T>(value: readonly T[]): readonly T[];
export function ensureArray<T>(value: T | readonly T[]): readonly T[] {
  if (Array.isArray(value)) {
    return [...value] as readonly T[];
  }
  return [value as T] as readonly T[];
}

export const normalizeTuple = <TValue, const TTuple extends readonly TValue[]>(values: TTuple): Normalize<TTuple> => {
  const uniq = [...new Set(values)];
  return uniq as unknown as Normalize<TTuple>;
};

export const groupByNamespace = <TEntry extends { namespace: string; id: string }>(
  entries: readonly TEntry[],
): Readonly<Record<string, readonly TEntry[]>> => {
  const output: Record<string, TEntry[]> = {};
  for (const entry of entries) {
    const key = normalizeRoute(entry.namespace);
    output[key] = [...(output[key] ?? []), entry];
  }
  return output as Readonly<Record<string, readonly TEntry[]>>;
};

export const mergeRouteMap = <TLeft extends Record<string, unknown>, TRight extends Record<string, unknown>>(
  left: TLeft,
  right: TRight,
): Normalize<TLeft & Omit<TRight, keyof TLeft>> => ({
  ...left,
  ...right,
});

export const selectByKind = <T extends Record<string, unknown>, TKind extends keyof T & string>(
  events: readonly EventUnion<T>[],
  kind: TKind,
): readonly Extract<EventUnion<T>, { kind: EventToken<TKind> }>[] =>
  events.filter(
    (entry): entry is Extract<EventUnion<T>, { kind: EventToken<TKind> }> => entry.kind === `event:${kind}`,
  );

export const toEntries = <T extends Record<string, unknown>>(value: T): Array<[string, unknown]> => {
  const entries: Array<[string, unknown]> = [];
  for (const [key, next] of Object.entries(value)) {
    entries.push([key, next]);
  }
  return entries;
};

export const buildCatalogSnapshot = <T extends Record<string, unknown>, const TName extends string>(
  namespace: `namespace:${TName}`,
  catalog: T,
) => {
  const keys = Object.keys(catalog) as Array<keyof T & string>;
  const sample = keys.slice(0, 2);
  return {
    namespace,
    count: keys.length,
    keys: keys.toSorted(),
    sample,
  } satisfies {
    namespace: `namespace:${TName}`;
    count: number;
    keys: readonly (keyof T & string)[];
    sample: readonly string[];
  };
};

export const assertNoDuplicateIds = <T extends readonly { id: string }[]>(values: T): void => {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value.id)) {
      throw new Error(`duplicate-id:${value.id}`);
    }
    seen.add(value.id);
  }
};
