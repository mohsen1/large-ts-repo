type BuildTupleInternal<
  Length extends number,
  Acc extends unknown[] = []
> = Acc['length'] extends Length ? Acc : BuildTupleInternal<Length, [...Acc, Acc['length']]>;

type Decrement<N extends number> = BuildTupleInternal<N> extends [infer _Head, ...infer Tail]
  ? Tail['length']
  : 0;

export type TupleBuilder<
  Length extends number,
  Acc extends readonly unknown[] = []
> = Acc['length'] extends Length
  ? Acc
  : TupleBuilder<Length, [...Acc, { readonly index: Acc['length'] }]>;

export type RepeatTuple<T, Count extends number> = Count extends 0
  ? []
  : [T, ...RepeatTuple<T, Decrement<Count>>];

export type NumericPath = `${number}.${number}.${number}`;

export type ParsePath<T extends string> = T extends `${infer A}.${infer B}.${infer C}`
  ? [A extends `${number}` ? A : never, B extends `${number}` ? B : never, C extends `${number}` ? C : never]
  : never;

export type PathToTuple<T extends string> = ParsePath<T> extends [infer A, infer B, infer C]
  ? [A & string, B & string, C & string]
  : never;

export type DeepNest<T, Depth extends number> = Depth extends 0
  ? { readonly terminal: T; readonly depth: 'done' }
  : {
      readonly depth: Depth;
      readonly nested: DeepNest<T, Decrement<Depth>>;
    };

export type Mirror<T> = T extends readonly [infer H, ...infer Tail]
  ? [Mirror<H>, ...Mirror<Tail>]
  : T extends readonly unknown[]
    ? Mirror<T[number]>[]
    : T extends object
      ? { [K in keyof T]: Mirror<T[K]> }
      : T;

export type MergeValues<
  A,
  B
> = A extends object
  ? B extends object
    ? {
        [K in keyof (A & B)]: K extends keyof B
          ? K extends keyof A
            ? MergeValues<A[K], B[K]>
            : B[K]
          : K extends keyof A
            ? A[K]
            : never;
      }
    : B
  : B;

export type RecursiveCatalog<
  T,
  Depth extends number = 18,
  History extends readonly unknown[] = []
> = Depth extends 0
  ? {
      readonly terminal: true;
      readonly value: T;
      readonly history: History;
    }
  : {
      readonly terminal: false;
      readonly value: T;
      readonly depth: Depth;
      readonly history: History;
      readonly next: RecursiveCatalog<MergeValues<T, { readonly level: Depth }>, Decrement<Depth>, [...History, T]>;
    };

export type RecursiveSolver<T, Depth extends number = 12> = RecursiveCatalog<T, Depth> & {
  readonly checksum: Depth extends 0 ? 0 : RecursiveSolver<MergeValues<T, { readonly depth: Depth }>, Decrement<Depth>>;
};

type SolverProbeInput<T> = T extends { route: infer R; payload: infer P }
  ? { route: R; payload: P; timestamp: number }
  : { route: string; payload: T; timestamp: number };

type SolverBranch<A> = A extends readonly [infer Head, ...infer Tail]
  ? Head extends string
    ? `${Head}:${Tail['length']}`
    : never
  : 'empty';

export type SolverEnvelope<T, N extends number = 10> = {
  readonly bundle: TupleBuilder<N>;
  readonly tags: RepeatTuple<`tag-${N}`, N>;
  readonly recursive: RecursiveSolver<T, N>;
  readonly branch: SolverBranch<T extends readonly string[] ? T : ['fallback']>;
};

export const buildDepthChain = <T, N extends number>(input: T, depth: N): RecursiveCatalog<T, N> => {
  const next = (current: unknown, currentDepth: number): unknown => {
    if (currentDepth <= 0) {
      return { terminal: true, value: current, history: [] };
    }
    return {
      terminal: false,
      value: current,
      depth: currentDepth,
      history: [],
      next: next({ ...input, level: currentDepth }, currentDepth - 1),
    };
  };
  return next(input, Number(depth)) as RecursiveCatalog<T, N>;
};

export const solveRecursiveCatalog = <T, N extends number>(
  payload: SolverProbeInput<T>,
  recursion: N,
): SolverEnvelope<T, N> => {
  const next = (node: number): number[] => {
    if (node <= 0) return [node];
    return [node, ...next(node - 1)];
  };
  const chain = next(recursion);
  return {
    bundle: chain.map((index) => ({ index })) as TupleBuilder<N>,
    tags: chain.map((index) => `tag-${index}`) as RepeatTuple<`tag-${N}`, N>,
    recursive: buildDepthChain(payload, recursion) as RecursiveSolver<T, N>,
    branch: `seed:${chain.length}` as SolverBranch<T extends readonly string[] ? T : ['fallback']>,
  };
};

type PathReducer<T, Prefix extends string = ''> = T extends readonly [infer H, ...infer Tail]
  ? H extends string
    ? Prefix extends ''
      ? PathReducer<Tail, H>
      : PathReducer<Tail, `${Prefix}.${H}`>
    : Prefix
  : Prefix;

export type SolverPath<T extends readonly string[]> = PathReducer<T>;

export const pathSeed = <T extends readonly string[]>(segments: T): SolverPath<T> => {
  return segments.join('.') as SolverPath<T>;
};

export type Accumulator<T, Depth extends number = 8> = {
  readonly current: T;
  readonly depth: Depth;
  readonly trace: TupleBuilder<Depth>;
};

export type FoldCatalog<T extends readonly unknown[], Output> = T extends readonly [infer Head, ...infer Tail]
  ? FoldCatalog<Tail, MergeValues<Output, { readonly [K in `${Extract<Tail['length'], number>}`]: Head }>>
  : Output;

export const foldCatalog = <T extends readonly unknown[]>(input: T): FoldCatalog<T, {}> => {
  return input.reduce<Record<string, unknown>>((acc, value, index) => {
    acc[`${index}`] = value;
    return acc;
  }, {}) as FoldCatalog<T, {}>;
};

