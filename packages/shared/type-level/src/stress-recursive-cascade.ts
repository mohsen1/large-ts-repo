export type NoInfer<T> = [T][T extends any ? 0 : never];

export type BuildTuple<T, N extends number, TAcc extends T[] = []> = TAcc['length'] extends N
  ? TAcc
  : BuildTuple<T, N, [...TAcc, T]>;

export type Head<T extends readonly unknown[]> = T extends readonly [infer H, ...unknown[]] ? H : never;
export type Tail<T extends readonly unknown[]> = T extends readonly [unknown, ...infer Rest] ? Rest : [];

export type Decrement<N extends number> =
  BuildTuple<unknown, N> extends [...infer Left, unknown]
    ? Left['length']
    : 0;

export type Increment<N extends number> =
  BuildTuple<unknown, N> extends infer U extends unknown[]
    ? [...U, unknown]['length']
    : never;

export type Add<A extends number, B extends number> = [...BuildTuple<unknown, A>, ...BuildTuple<unknown, B>]['length'];

export type Multiply<A extends number, B extends number, Acc extends unknown[] = []> =
  B extends 0 ? Acc['length'] : Multiply<A, Decrement<B>, [...BuildTuple<unknown, A>, ...Acc]>;

export type FoldTuple<T extends readonly unknown[], Acc> =
  T extends readonly [infer H, ...infer Rest]
    ? FoldTuple<Rest, [Acc, H]>
    : Acc;

export type Stringify<N extends number> = `${N}`;

export type Rehydrate<T extends readonly unknown[], Acc extends string = ''> =
  T extends readonly [infer Head, ...infer Tail]
    ? Rehydrate<Tail, `${Acc}${Head & string}-`>
    : Acc;

export type NormalizeLiteral<T> = T extends string | number | boolean ? `${T}` : 'complex';

export type DeepRecursive<T, D extends number> =
  D extends 0
    ? T
    : T extends readonly (infer U)[]
      ? { readonly values: readonly DeepRecursive<U, Decrement<D>>[] }
      : T extends Record<string, infer U>
        ? { readonly [K in keyof T]: { readonly key: K; readonly value: DeepRecursive<U, Decrement<D>> } }
        : T;

export type SolverCatalog =
  | { readonly kind: 'leaf'; readonly level: 0 }
  | { readonly kind: 'branch'; readonly level: number; readonly left: SolverCatalog; readonly right: SolverCatalog };

export type PushCatalog<T extends SolverCatalog, D extends number> =
  D extends 0
    ? T
    : { readonly kind: 'branch'; readonly level: D; readonly left: PushCatalog<T, Decrement<D>>; readonly right: PushCatalog<T, Decrement<D>> };

export type SolverPath<T extends SolverCatalog> = T extends { kind: 'leaf'; level: infer L }
  ? ['leaf', L]
  : T extends { kind: 'branch'; level: infer L; left: infer LBranch; right: infer RBranch }
    ? [
        ...(LBranch extends SolverCatalog ? SolverPath<LBranch> : never),
        'branch',
        L,
        ...(RBranch extends SolverCatalog ? SolverPath<RBranch> : never),
      ]
    : never;

export type CascadeResult<T extends SolverCatalog> = T extends { kind: 'leaf' }
  ? readonly ['complete']
  : T extends { kind: 'branch'; left: infer L; right: infer R }
    ? L extends SolverCatalog
      ? R extends SolverCatalog
        ? [...CascadeResult<L>, ...CascadeResult<R>]
        : never
      : never
    : never;

export interface RecursionConfig {
  readonly namespace: string;
  readonly levels: number;
  readonly seed: string;
}

export type RecursiveMap<TInput, D extends number, Acc extends unknown[] = []> =
  D extends 0
    ? Acc
    : TInput extends readonly [infer H, ...infer R]
      ? RecursiveMap<R, Decrement<D>, [...Acc, H]>
      : RecursiveMap<[], 0, Acc>;

export type ReverseRecursive<T extends readonly unknown[]> = T extends readonly [infer H, ...infer Rest]
  ? [...ReverseRecursive<Rest>, H]
  : [];

export type NormalizeRecursiveInput<T extends readonly unknown[], D extends number> = T extends readonly []
  ? 'empty'
  : D extends 0
    ? 'depth'
    : Head<T> extends readonly unknown[]
      ? 'array'
      : Head<T> extends string
        ? `str:${NormalizeLiteral<Head<T>>}`
        : 'other';

export type MutualA<T, D extends number> =
  D extends 0
    ? { done: true }
    : T extends readonly [infer Head, ...infer Rest]
      ? { head: Head; next: MutualB<Rest, Decrement<D>> }
      : { none: true };

export type MutualB<T, D extends number> =
  D extends 0
    ? { done: true }
    : T extends readonly [infer Head, ...infer Rest]
      ? { branch: Head; next: MutualA<Rest, Decrement<D>> }
      : { none: true };

export type MutualDepth<T> = MutualA<T, 12>;

export type RouteStateTuple = readonly [string, string, string, string?];

export const compileTuple = <T extends number>(depth: T): BuildTuple<string, T> => {
  return Array.from({ length: depth }, (_, index) => `n${index}`) as BuildTuple<string, T>;
};

export const solveRecursiveCatalog = <T extends SolverCatalog, D extends number>(
  depth: D,
  initial: T,
): PushCatalog<T, D> => {
  const seed: PushCatalog<T, D> =
    depth === 0
      ? (initial as PushCatalog<T, D>)
      : ({
          kind: 'branch',
          level: depth,
          left: solveRecursiveCatalog(depth - 1, initial) as PushCatalog<T, Decrement<D>>,
          right: solveRecursiveCatalog(depth - 1, initial) as PushCatalog<T, Decrement<D>>,
        } as PushCatalog<T, D>);

  return seed;
};

export const flattenCatalog = <T extends SolverCatalog>(tree: T): CascadeResult<T> => {
  const walk = (node: SolverCatalog): readonly string[] => {
    if (node.kind === 'leaf') {
      return ['complete'];
    }

    return [...walk(node.left), ...walk(node.right)];
  };

  return walk(tree) as CascadeResult<T>;
};

export const resolveRecursiveCatalog = <T extends readonly unknown[]>(input: T, depth: number) => {
  const build = (value: readonly unknown[], remaining: number): readonly unknown[] => {
    if (remaining <= 0 || value.length === 0) {
      return value;
    }
    const [head, ...rest] = value as readonly unknown[];
    return [head, ...build(rest, remaining - 1)];
  };

  return build(input, depth) as readonly unknown[];
};
