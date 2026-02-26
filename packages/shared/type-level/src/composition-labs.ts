export type NoInferAdvanced<T> = [T][T extends any ? 0 : never];

export type Branded<T, B extends string> = T & { readonly __brand: B };

export interface TokenizedTemplate<T extends string> {
  readonly raw: T;
  readonly escaped: string;
  readonly tokens: SplitTemplate<T>;
}

export type SplitTemplate<T extends string> = T extends `${infer Head}-${infer Tail}`
  ? readonly [Head, ...SplitTemplate<Tail>]
  : readonly [T];

export type JoinTemplate<T extends readonly string[], TSeparator extends string = '.'> = T extends readonly [
  infer Head,
  ...infer Rest,
]
  ? Head extends string
    ? Rest extends readonly string[]
      ? Rest extends []
        ? Head
        : `${Head}${TSeparator}${JoinTemplate<Rest, TSeparator>}`
      : never
    : never
  : '';

export type SnakeToKebab<T extends string> = T extends `${infer Head}${infer Rest}`
  ? Head extends Lowercase<Head>
    ? `${Lowercase<Head>}${SnakeToKebab<Rest>}`
    : `-${Lowercase<Head>}${SnakeToKebab<Rest>}`
  : T;

export type NamespaceKey<T extends string> = `${Lowercase<T>}.${number}`;

export type RemoveUndefined<T> = T extends undefined ? never : T;

export type DeepStrip<T> = T extends (...args: any[]) => unknown
  ? T
  : T extends readonly [infer Head, ...infer Rest]
    ? readonly [DeepStrip<Head>, ...DeepStripTuple<Rest>]
    : T extends readonly unknown[]
      ? ReadonlyArray<DeepStrip<T[number]>>
      : T extends object
        ? { [K in keyof T]-?: DeepStrip<T[K]> }
        : T;

export type DeepStripTuple<T extends readonly unknown[]> =
  T extends readonly [infer Head, ...infer Rest]
    ? readonly [DeepStrip<Head>, ...DeepStripTuple<Rest>]
    : [];

export type KeyRemapWithNamespace<T, Prefix extends string> = {
  [K in keyof T as K extends string ? `${Prefix}${SnakeToKebab<K>}` : never]: T[K];
};

export type RecursiveTupleKeysUnique<T> = T extends readonly [infer Head, ...infer Rest]
  ? readonly [Head & string, ...RecursiveTupleKeysUnique<Rest>]
  : [];

export type PrefixUnion<T extends readonly string[], P extends string> = T extends readonly [
  infer Head,
  ...infer Rest,
]
  ? Head extends string
    ? Rest extends readonly string[]
      ? readonly [`${P}:${Head}`, ...PrefixUnion<Rest, P>]
      : readonly [`${P}:${Head}`]
    : readonly [`${P}:${string}`]
  : [];

export type RecursiveMerge<A, B> = A extends object
  ? {
      [K in keyof A | keyof B]: K extends keyof B
        ? K extends keyof A
          ? RecursiveMerge<A[K], B[K]>
          : B[K]
        : K extends keyof A
          ? A[K]
          : never;
    }
  : B;

export type MapObjectByValueType<T, V> = {
  [K in keyof T as T[K] extends V ? K : never]: T[K];
};

export type ValuesByKind<T extends Record<string, unknown>, K> = {
  readonly [P in keyof T]: T[P] extends K ? T[P] : never;
}[keyof T];

export type FlattenDeep<T> = T extends readonly [infer Head, ...infer Rest]
  ? [...FlattenDeep<Head>, ...FlattenDeep<Rest>]
  : T extends readonly (infer U)[]
    ? FlattenDeep<U>
    : readonly T[];

export type FlattenTuple<T> = T extends readonly unknown[]
  ? { readonly [K in keyof T]: T[K] }[number][]
  : T;

export type VariadicMerge<T extends readonly unknown[]> =
  T extends readonly [infer Head, ...infer Rest]
    ? Head & (Rest extends readonly unknown[] ? VariadicMerge<Rest> : unknown)
    : {};

export type Head<T extends readonly unknown[]> = T extends readonly [infer H, ...unknown[]] ? H : never;

export type Tail<T extends readonly unknown[]> = T extends readonly [unknown, ...infer Rest] ? Rest : [];

export type PairwiseJoin<
  A extends readonly string[],
  B extends readonly string[],
> = A extends readonly [infer AH, ...infer AT]
    ? B extends readonly [infer BH, ...infer BT]
      ? readonly [`${AH & string}|${BH & string}`, ...PairwiseJoin<AT & readonly string[], BT & readonly string[]>]
      : []
    : [];

export interface TraceTag<T extends string> {
  readonly key: NamespaceKey<T>;
  readonly value: string;
  readonly createdAt: number;
}

export type TraceRecord<T extends string, TState> = {
  readonly namespace: T;
  readonly state: TState;
  readonly tags: readonly TraceTag<T>[];
};

export interface DisposableTraceHandle {
  [Symbol.dispose](): void;
}

export interface AsyncDisposableTraceHandle {
  [Symbol.asyncDispose](): Promise<void>;
}

type IteratorLike<T> = {
  map<TResult>(mapper: (value: T, index: number) => TResult): { toArray(): TResult[] };
};

const iteratorFactory = (globalThis as {
  readonly Iterator?: {
    from?<TValue>(value: Iterable<TValue>): IteratorLike<TValue>;
  };
}).Iterator;

export const tokenizeTemplate = <T extends string>(template: T): SplitTemplate<T> => {
  return template.split('-') as unknown as SplitTemplate<T>;
};

export const toTokenizedTemplate = <const T extends string>(template: T): TokenizedTemplate<T> => ({
  raw: template,
  escaped: template.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'),
  tokens: tokenizeTemplate(template),
});

export const normalizeNamespace = <const T extends string>(namespace: T): NamespaceKey<T> => {
  return `${namespace.toLowerCase()}:0` as NamespaceKey<T>;
};

export const uniqueByKey = <
  T extends readonly unknown[],
  K extends keyof T[number] & string,
>(
  rows: T,
  key: K,
): T[number][] => {
  const seen = new Set<unknown>();
  const out: T[number][] = [];
  for (const row of rows) {
    const value = (row as Record<string, unknown>)[key];
    if (!seen.has(value)) {
      seen.add(value);
      out.push(row);
    }
  }
  return out;
};

export const chunkByKey = <
  T extends readonly Record<string, unknown>[],
  TKey extends keyof T[number] & string,
>(
  rows: T,
  key: TKey,
): Readonly<Record<string, readonly T[number][]>> => {
  const buckets = rows.reduce<Record<string, T[number][]>>((acc, row) => {
    const bucket = String(row[key] ?? '');
    const values = acc[bucket] ?? [];
    values.push(row);
    acc[bucket] = values;
    return acc;
  }, {});
  return buckets as Readonly<Record<string, readonly T[number][]>>;
};

export const mapWithIteratorHelpers = <T, TResult>(
  rows: Iterable<T>,
  mapper: (value: T, index: number, total: number) => TResult,
): readonly TResult[] => {
  const list = Array.isArray(rows) ? rows : fromIterable(rows);
  const iterator = iteratorFactory?.from?.(rows);
  if (iterator) {
    return iterator.map((value, index) => mapper(value, index, list.length)).toArray();
  }
  return list.map((value, index) => mapper(value, index, list.length));
};

export const mergeTuples = <
  TLeft extends readonly unknown[],
  TRight extends readonly unknown[],
>(left: TLeft, right: TRight): readonly [...TLeft, ...TRight] => {
  return [...left, ...right] as readonly [...TLeft, ...TRight];
};

export type ReverseFold<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Rest]
  ? [...ReverseFold<Rest>, Head]
  : [];

export const reverseFold = <T extends readonly unknown[]>(rows: T): ReverseFold<T> => {
  const stack: unknown[] = [];
  for (const row of rows) {
    stack.unshift(row);
  }
  return stack as ReverseFold<T>;
};

export const ensureIterable = <T>(value: T): value is Extract<T, Iterable<T>> => {
  return typeof value === 'object' && value !== null && Symbol.iterator in Object(value);
};

export const zipIterables = <
  A extends readonly unknown[],
  B extends readonly unknown[],
>(
  left: NoInferAdvanced<A>,
  right: NoInferAdvanced<B>,
): readonly [A[number], B[number]][] => {
  const length = Math.min(left.length, right.length);
  const out: [A[number], B[number]][] = [];
  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];
    if (leftValue === undefined || rightValue === undefined) {
      continue;
    }
    out.push([leftValue, rightValue] as [A[number], B[number]]);
  }
  return out;
};

export const collectToMap = <
  T extends readonly Record<string, unknown>[],
  TKey extends keyof T[number] & string,
>(rows: T, key: TKey): ReadonlyMap<string, T[number]> => {
  const out = new Map<string, T[number]>();
  for (const row of rows) {
    out.set(String(row[key]), row);
  }
  return out;
};

export const cartesianMatrix = <
  const TLeft extends readonly unknown[],
  const TRight extends readonly unknown[],
>(left: TLeft, right: TRight): ReadonlyArray<[TLeft[number], TRight[number]]> => {
  const out: Array<[TLeft[number], TRight[number]]> = [];
  for (const leftValue of left) {
    for (const rightValue of right) {
      out.push([leftValue, rightValue]);
    }
  }
  return out;
};

export const asDiscriminator = <T extends string>(value: T): `${T}:${string}` => {
  return `${value}:${Date.now().toString(36).slice(-8)}` as `${T}:${string}`;
};

export const normalizeNamespaceBatch = <T extends string>(
  values: readonly T[],
): readonly NamespaceKey<T>[] => values.map((entry) => normalizeNamespace(entry));

export const mergeRecords = <
  TLeft extends Record<string, unknown>,
  TRight extends Record<string, unknown>,
>(
  left: TLeft,
  right: TRight,
): {
  readonly [K in keyof TLeft | keyof TRight]:
    K extends keyof TLeft
      ? (K extends keyof TRight ? TRight[K] : TLeft[K])
      : K extends keyof TRight
      ? TRight[K]
      : never;
} =>
  ({ ...left, ...right } as {
    readonly [K in keyof TLeft | keyof TRight]:
      K extends keyof TLeft
        ? (K extends keyof TRight ? TRight[K] : TLeft[K])
        : K extends keyof TRight
        ? TRight[K]
        : never;
  });

export type PluginTraceLineage<T extends readonly [string, ...string[]]> = {
  readonly index: number;
  readonly value: T[number];
  readonly parent: T[number] | undefined;
}[];

export const linealize = <const T extends readonly [string, ...string[]]>(value: T): PluginTraceLineage<T> => {
  const out: { index: number; value: T[number]; parent: T[number] | undefined }[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    const parent = index === 0 ? undefined : value[index - 1];
    out.push({
      index,
      value: entry,
      parent,
    });
  }
  return out;
};

export const toRecordString = <T extends Record<string, unknown>>(value: T): string => {
  return Object.entries(value)
    .map(
      ([key, val]) => `${encodeURIComponent(key)}=${encodeURIComponent(typeof val === 'string' ? val : JSON.stringify(val))}`,
    )
    .sort()
    .join('&');
};

export const fromIterable = <T>(value: Iterable<T>): T[] => {
  return [...value];
};

export const mapByIndex = <T, TResult>(
  rows: readonly T[],
  mapper: (value: T, index: number) => TResult,
): readonly TResult[] => rows.map((value, index) => mapper(value, index));
