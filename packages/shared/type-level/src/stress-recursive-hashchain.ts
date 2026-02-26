type BuildNatTuple<TTarget extends number, TAccumulator extends unknown[] = []> = TAccumulator['length'] extends TTarget
  ? TAccumulator
  : BuildNatTuple<TTarget, [...TAccumulator, unknown]>;

export type Decrement<T extends number> = BuildNatTuple<T> extends [unknown, ...infer TRest]
  ? TRest['length']
  : 0;

export type Increment<T extends number> = [...BuildNatTuple<T>, unknown]['length'];

export const MaxDepth = 28;

export type HashSeed = {
  readonly layer: number;
  readonly stamp: number;
  readonly payload: string;
};

export type HashCarrier<TPayload> = Readonly<{
  readonly stamp: TPayload;
  readonly signature: string;
  readonly layer: number;
}>;

export type DeepHashTuple<TPayload, TDepth extends number, TAccumulator extends readonly HashCarrier<TPayload>[] = []> = TDepth extends 0
  ? TAccumulator
  : DeepHashTuple<
      TPayload,
      Decrement<TDepth>,
      [
        ...TAccumulator,
        Readonly<{
          readonly stamp: TPayload;
          readonly signature: string;
          readonly layer: TDepth;
        }>,
      ]
    >;

export type HashChain<TPayload, TDepth extends number> = ReadonlyArray<HashCarrier<TPayload>>;

type AccumulatorDepth<TDepth extends number, T extends readonly unknown[] = []> = TDepth extends 0
  ? T
  : AccumulatorDepth<Decrement<TDepth>, [TDepth, ...T]>;

export type HashPath<T extends number> = HashChain<string, T>;

export type HashFoldResult<TPayload, TDepth extends number> = DeepHashTuple<TPayload, TDepth>;

export const buildHashTuple = <TValue, TLength extends number>(length: TLength, seed: TValue): HashCarrier<TValue>[] => {
  const out: HashCarrier<TValue>[] = [];
  for (let layer = 0; layer < length; layer += 1) {
    out.push({
      stamp: seed,
      signature: `hash-${String(seed)}`,
      layer,
    });
  }
  return out;
};

export const hashCarrierLabel = <T extends string>(value: T): HashCarrier<T> => ({
  stamp: value,
  signature: `hash-${value}`,
  layer: 0,
});

const normalizeDepth = (value: number): number => (value < 0 ? 0 : value > MaxDepth ? MaxDepth : value);

export type HashTree<T extends number> = T extends 0
  ? { readonly node: 'leaf'; readonly children: [] }
  : {
      readonly node: `depth-${T}`;
      readonly value: HashSeed;
      readonly children: [HashTree<Decrement<T>>];
    };

export type HashResolver<TInput, TDepth extends number> = HashPath<TDepth> extends infer Chain
  ? Chain extends readonly HashCarrier<TInput>[]
    ? {
        readonly chainDepth: TDepth;
        readonly chainLength: Chain['length'];
      }
    : never
  : never;

type MutualA<TInput, TDepth extends number, TResult extends readonly unknown[] = []> = TDepth extends 0
  ? TResult
  : MutualA<TInput, Decrement<TDepth>, [...TResult, HashCarrier<TInput>]>;

type MutualB<TInput, TDepth extends number, TResult extends readonly unknown[] = []> = TDepth extends 0
  ? TResult
  : TDepth extends 1
    ? MutualA<TInput, 0, [...TResult, TDepth]>
    : MutualB<TInput, Decrement<TDepth>, [...TResult, TDepth]>;

export type MutualFoldA<TInput, TDepth extends number> = MutualA<TInput, TDepth>;
export type MutualFoldB<TInput, TDepth extends number> = MutualB<TInput, TDepth>;
export type MutualAInput<T extends number> = MutualFoldA<string, T>['length'];
export type MutualBInput<T extends number> = MutualFoldB<string, T>['length'];

const foldHashes = <TValue>(values: readonly TValue[]): readonly TValue[] => values.slice().reverse();

export const runRecursiveHash = (seed: HashSeed, depth: number): HashChain<string, number> => {
  const normalized = normalizeDepth(depth);
  const carriers = buildHashTuple(normalized, seed.stamp.toString());
  return carriers as HashChain<string, number>;
};

export const runMutualHash = (seed: string, depth: number): readonly string[] => {
  const first = buildHashTuple(normalizeDepth(depth), seed).map((entry) => `${entry.signature}:${entry.layer}`);
  const second = foldHashes(first);
  const third = new Map<string, string>();
  for (let index = 0; index < second.length; index += 1) {
    const entry = second[index];
    third.set(`${seed}:${index}`, String(entry));
  }
  return Array.from(third.entries()).map(([key, value]) => `${key}=${value}`);
};

export const HashWorkload = {
  maxDepth: MaxDepth as 28,
  baseStamp: 101,
  baseline: runRecursiveHash({ layer: 0, stamp: 101, payload: 'stress' }, 18),
  fallback: runMutualHash('seed', 16),
} as const;
