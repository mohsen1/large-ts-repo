export type NoInfer<T> = [T][T extends any ? 0 : never];
export type Nat = readonly unknown[];

export type BuildTuple<Length extends number, Acc extends Nat = []> =
  Acc['length'] extends Length ? Acc : BuildTuple<Length, [...Acc, unknown]>;

export type Decrement<N extends number> =
  BuildTuple<N> extends [infer _First, ...infer Tail]
    ? Tail['length']
    : 0;

export type Increment<N extends number> =
  [...BuildTuple<N>, unknown]['length'];

export type ArithmeticAdd<A extends number, B extends number> = [...BuildTuple<A>, ...BuildTuple<B>]['length'];
export type ArithmeticMul<A extends number, B extends number, Acc extends Nat = []> =
  B extends 0 ? Acc['length'] : ArithmeticMul<A, Decrement<B>, [...BuildTuple<A>, ...Acc]>;

export type WrapByDepth<T, N extends number> = N extends 0 ? T : { readonly value: T; readonly depth: N };

export type RecursiveEnvelope<T, N extends number> =
  N extends 0
    ? T
    : RecursiveEnvelope<WrapByDepth<T, N>, Decrement<N>>;

export type FoldDepth<T, Depth extends number> =
  Depth extends 0
    ? T
    : T extends readonly [infer Head, ...infer Tail]
      ? FoldDepth<Tail, Decrement<Depth>> & { readonly head: Head }
      : { readonly head: T };

export type Accumulator<T, D extends number> =
  D extends 0
    ? T
    : {
        readonly current: T;
        readonly next: Accumulator<T, Decrement<D>>;
      };

export type SplitByDepth<T, D extends number> =
  [D] extends [0]
    ? [T]
    : T extends [infer H, ...infer R]
      ? [H, ...SplitByDepth<R, Decrement<D>>]
      : [T];

export interface SolverNode<T, D extends number> {
  readonly depth: D;
  readonly payload: T;
}

export type MutualLeft<T, D extends number> =
  D extends 0 ? T : { readonly left: T; readonly tail: MutualRight<T, Decrement<D>> };

export type MutualRight<T, D extends number> =
  D extends 0 ? T : { readonly right: T; readonly tail: MutualLeft<T, Decrement<D>> };

export type ResolveMutual<T, D extends number> =
  MutualLeft<T, D> extends infer A
    ? A extends { left: T; tail: infer Tail }
      ? Tail extends never
        ? T
        : ResolveMutual<A, Decrement<D>>
      : never
    : never;

export const buildTuple = <const N extends number>(length: N): BuildTuple<N> => {
  const out: unknown[] = [];
  for (let i = 0; i < length; i += 1) {
    out.push(i);
  }
  return out as BuildTuple<N>;
};

export const recursiveWrap = <
  T,
  const N extends number,
>(value: T, levels: N): RecursiveEnvelope<T, N> => {
  let cursor: unknown = value;
  for (let depth = 0; depth < levels; depth += 1) {
    cursor = {
      value: cursor,
      depth,
    };
  }
  return cursor as RecursiveEnvelope<T, N>;
};

export const flattenRecursiveEnvelope = <
  T,
  const N extends number,
>(value: RecursiveEnvelope<T, N>): T => {
  let cursor: any = value;
  while (cursor && typeof cursor === 'object' && 'value' in cursor) {
    cursor = cursor.value;
  }
  return cursor as T;
};

export type RecursiveSolverInput = {
  readonly id: string;
  readonly rank: number;
  readonly active: boolean;
};

export type SolverReport<Payload, Steps extends number> =
  Steps extends 0
    ? {
        readonly finished: true;
        readonly payload: Payload;
      }
    : {
        readonly finished: false;
        readonly input: Payload;
        readonly step: Steps;
        readonly previous: SolverReport<Payload, Decrement<Steps>>;
      };

export const seedRecursive = (base: RecursiveSolverInput) => {
  const level0 = { finished: true, payload: base } as unknown as SolverReport<RecursiveSolverInput, 0>;
  const level1 = { finished: false, input: base, step: 1, previous: level0 } as unknown as SolverReport<RecursiveSolverInput, 1>;
  const level2 = { finished: false, input: base, step: 2, previous: level1 } as unknown as SolverReport<RecursiveSolverInput, 2>;
  const level3 = { finished: false, input: base, step: 3, previous: level2 } as unknown as SolverReport<RecursiveSolverInput, 3>;
  const level4 = { finished: false, input: base, step: 4, previous: level3 } as unknown as SolverReport<RecursiveSolverInput, 4>;
  const level5 = { finished: false, input: base, step: 5, previous: level4 } as unknown as SolverReport<RecursiveSolverInput, 5>;
  const level6 = { finished: false, input: base, step: 6, previous: level5 } as unknown as SolverReport<RecursiveSolverInput, 6>;
  const level7 = { finished: false, input: base, step: 7, previous: level6 } as unknown as SolverReport<RecursiveSolverInput, 7>;
  const level8 = { finished: false, input: base, step: 8, previous: level7 } as unknown as SolverReport<RecursiveSolverInput, 8>;
  const level9 = { finished: false, input: base, step: 9, previous: level8 } as unknown as SolverReport<RecursiveSolverInput, 9>;
  const level10 = { finished: false, input: base, step: 10, previous: level9 } as unknown as SolverReport<RecursiveSolverInput, 10>;
  const level11 = { finished: false, input: base, step: 11, previous: level10 } as unknown as SolverReport<RecursiveSolverInput, 11>;
  return { finished: false, input: base, step: 12, previous: level11 } as unknown as SolverReport<RecursiveSolverInput, 12>;
};

export const walkSolverReport = <Payload, const N extends number>(
  report: SolverReport<Payload, N>,
): readonly Payload[] => {
  const out: Payload[] = [];
  let cursor: SolverReport<Payload, number> = report as SolverReport<Payload, number>;
  while (!cursor.finished) {
    const active = cursor as SolverReport<Payload, number> & {
      readonly input: Payload;
      readonly previous: SolverReport<Payload, number>;
    };
    out.push(active.input);
    cursor = active.previous;
  }
  if (cursor.finished) {
    const finished = (cursor as unknown) as SolverReport<Payload, 0> & { readonly payload: Payload };
    out.push(finished.payload);
  }
  return out;
};

export type RecursiveCatalog<T extends Record<string, unknown>, N extends number> =
  N extends 0
    ? T
    : {
        readonly layer: N;
        readonly keys: readonly (keyof T & string)[];
        readonly child: RecursiveCatalog<T, Decrement<N>>;
      };

export const resolveRecursiveCatalog = <
  const T extends Record<string, unknown>,
  const N extends number,
>(catalog: NoInfer<T>, depth: N): RecursiveCatalog<T, N> => {
  const keys = Object.keys(catalog) as Array<keyof T & string>;
  const out = {
    layer: depth,
    keys,
    child:
      depth === 0
        ? (catalog as unknown as RecursiveCatalog<T, N>)
        : (resolveRecursiveCatalog(catalog, (depth - 1) as number) as unknown as RecursiveCatalog<T, N>),
  };
  return out as unknown as RecursiveCatalog<T, N>;
};

export const readRecursiveCatalog = <T extends Record<string, unknown>>(catalog: RecursiveCatalog<T, number>) => {
  const levels: number[] = [];
  let cursor: RecursiveCatalog<T, number> | undefined = catalog;
  while (cursor && 'layer' in cursor) {
    levels.push(cursor.layer);
    cursor = 'child' in cursor ? (cursor.child as unknown as RecursiveCatalog<T, number>) : undefined;
  }
  return levels;
};

export type SolverMatrixInput = {
  readonly id: string;
  readonly constraints: readonly string[];
  readonly depth: number;
};

export type SolverMatrix<Rows extends readonly SolverMatrixInput[], N extends number> =
  Rows extends readonly [infer H, ...infer R]
    ? readonly [
        H & { readonly index: N },
        ...SolverMatrix<R extends readonly SolverMatrixInput[] ? R : never, Decrement<N>>
      ]
    : readonly [];

export const collectSolverMatrix = <T extends readonly SolverMatrixInput[]>(rows: T): SolverMatrix<T, 32> => {
  return rows.map((row, index) => ({ ...row, index })) as unknown as SolverMatrix<T, 32>;
};
