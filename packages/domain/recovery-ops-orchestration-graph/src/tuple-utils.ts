export type Head<T extends readonly unknown[]> = T extends [infer H, ...unknown[]] ? H : never;

export type Tail<T extends readonly unknown[]> = T extends [unknown, ...infer R] ? R : never[];

export type Last<T extends readonly unknown[]> = T extends [...unknown[], infer L] ? L : never;

export type Length<T extends readonly unknown[]> = T['length'];

export type Concat<TLeft extends readonly unknown[], TRight extends readonly unknown[]> = TLeft extends [
  infer H,
  ...infer RTail,
]
  ? [H, ...Concat<RTail, TRight>]
  : TRight;

export type Prepend<T, TItems extends readonly unknown[]> = [T, ...TItems];

export type Append<T, TItems extends readonly unknown[]> = [...TItems, T];

export type Reverse<T extends readonly unknown[]> = T extends [infer H, ...infer R] ? [...Reverse<R>, H] : [];

export type Zip<TLeft extends readonly unknown[], TRight extends readonly unknown[]> =
  TLeft extends [infer L, ...infer LRest]
    ? TRight extends [infer R, ...infer RRest]
      ? [[L, R], ...Zip<LRest, RRest>]
      : []
    : [];

export type TupleIndex<T extends readonly unknown[]> = Exclude<keyof T, keyof any[]>;

export type ZipToMap<TLeft extends readonly unknown[], TRight extends readonly unknown[]> = Record<
  string,
  readonly [unknown, unknown]
>;

export type FillTuple<
  TItem,
  TLength extends number,
  TOutput extends readonly TItem[] = [],
> = TOutput['length'] extends TLength
  ? TOutput
  : FillTuple<TItem, TLength, [TItem, ...TOutput]>;

export type FillWithTuple<TItem, TLength extends number> = FillTuple<TItem, TLength>;

export type FlattenTuple<T extends readonly unknown[]> = T extends [infer Head, ...infer Rest]
  ? Head extends readonly unknown[]
    ? [...FlattenTuple<Head>, ...FlattenTuple<Rest>]
    : [Head, ...FlattenTuple<Rest>]
  : [];

export type RecursiveKey<T> = T extends readonly (infer U)[]
  ? `item:${RecursiveKey<U>}`
  : T extends object
    ? {
        [K in keyof T & string]: K | `${K}.${RecursiveKey<T[K]>}`;
      }[keyof T & string]
    : never;

export const assertNonEmpty = <T>(items: readonly T[]): [T, ...T[]] => {
  if (items.length === 0) {
    throw new Error('sequence must be non-empty');
  }
  return [items[0] as T, ...items.slice(1)] as [T, ...T[]];
};

export const safeHead = <T extends readonly unknown[]>(items: T): T extends [infer H, ...unknown[]] ? H : undefined => {
  return (items[0] as T extends [infer H, ...unknown[]] ? H : undefined);
};

export const createRepeatedTuple = <TItem, TLength extends number>(value: TItem, length: TLength): FillTuple<TItem, TLength> => {
  const next = [] as TItem[];
  for (let index = 0; index < length; index += 1) {
    next.push(value);
  }
  return next as FillTuple<TItem, TLength>;
};
