export type TupleShift<T extends readonly unknown[]> = T extends readonly [unknown, ...infer Rest] ? Rest : [];
export type TuplePush<T extends readonly unknown[], TItem> = readonly [...T, TItem];
export type TuplePrepend<T extends readonly unknown[], TItem> = readonly [TItem, ...T];

export type NumericRange<
  TSize extends number,
  TAccumulator extends readonly unknown[] = [],
> = TAccumulator['length'] extends TSize
  ? TAccumulator
  : NumericRange<TSize, TuplePush<TAccumulator, TAccumulator['length']>>;

export type Increment<T extends number> = [...NumericRange<T>, unknown]['length'];
export type Decrement<T extends number> = T extends 0
  ? 0
  : NumericRange<T> extends readonly [infer _Head, ...infer Rest]
    ? Rest['length']
    : never;

export type BuildTuple<
  TSize extends number,
  TAccumulator extends readonly unknown[] = [],
> = TAccumulator['length'] extends TSize
  ? TAccumulator
  : BuildTuple<TSize, TuplePush<TAccumulator, unknown>>;

export type BuildNumericTuple<
  TLimit extends number,
  T extends readonly unknown[] = [],
> = T['length'] extends TLimit
  ? T
  : BuildNumericTuple<TLimit, TuplePush<T, T['length']>>;

export type AppendLabel<TPrefix extends string, TIndex extends number> = `${TPrefix}${TIndex & number}`;

export type MapTuple<
  TInput extends readonly unknown[],
  TMap extends Record<string, unknown>,
  TPrefix extends string = '',
> = TInput extends readonly [infer Head, ...infer Tail]
  ? TMap & { readonly [K in `${TPrefix}:${TInput['length']}`]: Head }
  & MapTuple<Tail, TMap, `${TPrefix}:${Decrement<TInput['length'] & number>}`>
  : TMap;

export type RecursiveStripArray<T> = T extends readonly [infer Head, ...infer Tail]
  ? { readonly head: Head; readonly tail: RecursiveStripArray<Tail> }
  : { readonly tail: never };

export type RecursionProbe<T, Depth extends number, Seen extends readonly unknown[] = []> = Seen['length'] extends Depth
  ? Seen
  : T extends readonly [infer Head, ...infer Tail]
    ? RecursionProbe<Tail, Depth, TuplePush<Seen, RecursiveStripArray<[Head]>>>
    : Seen;

export type RecursiveNormalize<T> = T extends null | undefined
  ? never
  : T extends (...args: any[]) => any
    ? T
    : T extends object
      ? {
          [K in keyof T]-?: RecursiveNormalize<T[K]>;
        }
      : T;

export type ChainBuilder<
  TInput extends readonly unknown[],
  TDepth extends number,
  TCollector extends readonly unknown[] = [],
> = TDepth extends 0
  ? TCollector
  : TInput extends readonly []
    ? TCollector
    : TInput extends readonly [infer Head, ...infer Tail]
      ? ChainBuilder<Tail, Decrement<TDepth>, TuplePush<TCollector, Head>>
      : TCollector;

export type MutualA<T, N extends number> = N extends 0 ? T : MutualB<MutualA<T, Decrement<N>>, N>;
export type MutualB<T, N extends number> = T extends readonly [infer Head, ...infer Tail] ? [Head, ...MutualA<Tail, Decrement<N>>] : never;

export type NormalizeRecursive<T> = T extends readonly [infer Head, ...infer Tail]
  ? [NormalizeRecursive<Head>, ...NormalizeRecursive<Tail>]
  : T extends ReadonlyArray<infer TItem>
    ? readonly NormalizeRecursive<TItem>[]
    : T;

export type RecursiveTemplate<T extends string, Depth extends number> = Depth extends 0
  ? T
  : T extends `${infer Head}-${infer Tail}`
    ? `${Head}.${RecursiveTemplate<Tail, Decrement<Depth>>}`
    : T;

export type RecursiveTemplatePair<T extends string, Depth extends number> =
  RecursiveTemplate<`start-${T}`, Depth>;

export type VariadicFold<
  TInput extends readonly unknown[],
  TAcc,
  TTransform extends (item: unknown, acc: TAcc) => TAcc,
> = TInput extends readonly [infer Head, ...infer Tail]
  ? VariadicFold<Tail, TAcc & { readonly [K in keyof TAcc]: TAcc[K] }, TTransform>
  : TAcc;

export type RecusiveSum<T extends readonly number[], Base extends number = 0> = T extends readonly [
  infer Head extends number,
  ...infer Tail extends number[],
]
  ? RecusiveSum<Tail, Head extends never ? Base : Base | Head>
  : Base;

export interface RecursionRuntimePayload<T extends number = 0> {
  readonly id: `runtime-${T}`;
  readonly attempts: ReadonlyArray<`${string}-${number}`>;
  readonly trace: ReadonlyArray<number>;
}

export type RecursiveChain<T extends string, Depth extends number = 8> = Depth extends 0
  ? T
  : RecursiveChain<T extends `${infer Prefix}.${infer Suffix}` ? `${Suffix}-${Prefix}` : `${T}:${Depth}`, Decrement<Depth>>;

export type RecursiveUnions<TUnion extends string, Depth extends number> = Depth extends 0
  ? TUnion
  : RecursiveUnions<TUnion | `${TUnion}-${Depth}`, Decrement<Depth>>;

export type DeepMapValue<TRecord, TMap extends Record<string, string>> = {
  [K in keyof TRecord as K extends keyof TMap ? `${TMap[K & keyof TMap]}_${K & string}` : never]:
  TRecord[K] extends object
    ? DeepMapValue<TRecord[K], TMap>
    : TRecord[K];
};

export type PathLike<T extends object> = {
  [K in keyof T & string]: T[K] extends object
    ? `${K}` | `${K}.${PathLike<T[K]>}`
    : K;
}[keyof T & string];

export type DeepPathValue<T, Path> = Path extends `${infer Head}.${infer Tail}`
  ? Head extends keyof T
    ? DeepPathValue<T[Head], Tail>
    : never
  : Path extends keyof T
    ? T[Path]
    : never;

export type RecursivePathValue<T, Path extends string> = T extends object
  ? DeepPathValue<T, Path>
  : never;

export type DeepLookup<T extends object, Paths extends readonly string[]> = {
  [P in Paths[number]]: RecursivePathValue<T, P>;
};

export type TupleToRecord<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? { readonly [K in `${Extract<Head, string>}`]: TupleToRecord<Tail> } | { readonly [K in `${Extract<Head, string>}`]: Head }
  : {};

export type RecursiveAccumulator<
  T extends readonly unknown[],
  Acc = {},
  TIndex extends readonly unknown[] = [],
> = T extends readonly []
  ? Acc
  : T extends readonly [infer Head, ...infer Tail]
    ? RecursiveAccumulator<
        Tail,
        Acc & { readonly [K in `${TIndex['length']}`]: Head },
        [...TIndex, unknown]
      >
    : Acc;

export interface RecursiveRuntimeConfig {
  readonly depth: number;
  readonly tracePrefix: string;
  readonly active: boolean;
}

export const maxDepth = 24 as const satisfies number;

const range = (size: number): ReadonlyArray<number> =>
  Array.from({ length: size }, (_, index) => index);

export const buildNumericTuples = (size: number): ReadonlyArray<readonly unknown[]> => {
  const output = range(size).reduce((accumulator, current) => {
    const tuple = Array.from({ length: current + 1 }, () => current) as unknown[];
    accumulator.push(tuple);
    return accumulator;
  }, [] as unknown[][]);
  return output;
};

export const makeRecursiveTemplate = (
  input: string,
  depth: number,
): string => {
  let cursor = input;
  for (let idx = 0; idx < depth; idx += 1) {
    if (cursor.includes('-')) {
      const [prefix, suffix = 'base'] = cursor.split('-', 2);
      cursor = `${prefix}.${suffix}`;
    } else {
      cursor = `${cursor}.${depth - idx}`;
    }
  }
  return cursor;
};

export const flattenChain = <T extends readonly unknown[]>(items: T): RecursiveAccumulator<T> => {
  const accumulator: Array<[number, T[number]]> = [];
  for (let index = 0; index < items.length; index += 1) {
    accumulator.push([index, items[index] ?? null]);
  }
  return accumulator.reduce((carry, [index, item]) => {
    (carry as Record<string, unknown>)[`${index}`] = item;
    return carry;
  }, {} as RecursiveAccumulator<T>) as RecursiveAccumulator<T>;
};

export const recursiveTrace = <T extends number>(depth: T): ReadonlyArray<RecursionRuntimePayload<T>> => {
  const output: RecursionRuntimePayload<T>[] = [];
  for (let index = 0; index < depth; index += 1) {
    output.push({
      id: `runtime-${index as T}`,
      attempts: range(index).map((value) => `attempt-${value}`) as ReadonlyArray<`${string}-${number}`>,
      trace: range(index + 1),
    });
  }
  return output;
};

export type RecursivePayloadResult<T extends ReadonlyArray<string>> = {
  readonly payload: RecursionRuntimePayload<T['length']>;
  readonly items: T;
};

export const chainFromRoutes = (routes: ReadonlyArray<string>, depth = 16): ReadonlyArray<string> => {
  const output: string[] = [];
  const queue = [...routes];
  const steps = routes.length > 0 ? routes.length : 1;
  for (let index = 0; index < depth; index += 1) {
    const current = queue[index % steps] ?? '/identity/create/root';
    const next = makeRecursiveTemplate(current.replace('/', '').replace('-', '.'), Math.max(2, (depth - index) / 2));
    output.push(`/${next}`.replace(/\\.{2,}/g, '/'));
  }
  return output;
};

export type RecursiveSolver<T extends string, Depth extends number> = RouteSolution<T, Depth>;
type RouteSolution<T extends string, Depth extends number> =
  Depth extends 0 ? T : RouteSolution<T extends `${infer Head}-${infer Tail}` ? `${Head}.${Tail}` : `${T}-${Depth}`, Decrement<Depth>>;

export type RecursiveUnion<T extends readonly string[], Depth extends number> = T extends readonly [infer Head, ...infer Tail]
  ? (Head & string) | RecursiveUnion<Extract<Tail, readonly string[]>, Decrement<Depth>>
  : never;

export const computeRecursiveUnion = <T extends string[], Depth extends number>(
  values: readonly [...T],
  depth: Depth,
): ReadonlyArray<RecursiveUnion<T, Depth>> => {
  const result = new Set<string>();
  const queue = [...values];
  for (let index = 0; index < queue.length * Math.max(depth, 1); index += 1) {
    const source = queue[index % queue.length];
    if (!source) {
      continue;
    }
    result.add(`${source}-${index % Math.max(depth, 1)}`);
  }
  return [...result] as unknown as ReadonlyArray<RecursiveUnion<T, Depth>>;
};
