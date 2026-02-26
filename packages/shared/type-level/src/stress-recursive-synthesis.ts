export type Increment<T extends unknown[]> = [...T, unknown];
export type BuildTuple<
  N extends number,
  Acc extends unknown[] = [],
> = Acc['length'] extends N ? Acc : BuildTuple<N, Increment<Acc>>;

export type Decrement<N extends number> = BuildTuple<N> extends [infer _First, ...infer Rest]
  ? Rest['length']
  : 0;

export type Wrap<T> = [T];
export type Unwrap<T> = T extends [infer U] ? U : never;

export type RecursiveAccumulator<T, N extends number, Acc extends unknown[] = []> = N extends 0
  ? Acc
  : RecursiveAccumulator<Wrap<T>, Decrement<N>, Increment<Acc>>;

export type RecursiveAlternate<T, N extends number> = N extends 0
  ? T
  : RecursiveAccumulator<T, N> extends infer A extends unknown[]
    ? A extends readonly [infer X, ...infer _Tail]
      ? RecursiveAlternate<X, Decrement<N>>
      : never
    : never;

export type MatrixEdge =
  | { readonly kind: 'to-core'; readonly cost: 1 }
  | { readonly kind: 'to-edge'; readonly cost: 2 }
  | { readonly kind: 'to-ops'; readonly cost: 3 };

export type PathNode<T extends string> = {
  readonly id: T;
  readonly edges: readonly MatrixEdge[];
};

export type EdgeMap<T extends string[]> = {
  [K in T[number]]: PathNode<K>;
};

export type MutuallyNested<A, B> = A extends B ? { readonly stage: 'A-B'; value: A & B } : never;

export type RecursiveFold<T, N extends number> = N extends 0
  ? T
  : T extends readonly [infer Head, ...infer Tail]
    ? [MutuallyNested<Head, Head & { readonly level: N }>, ...RecursiveFold<Tail, Decrement<N>>]
    : [];

export type RecursiveMap<T> = T extends [infer H, ...infer Tail]
  ? [
      H extends string
        ? {
            readonly label: `map:${H}`;
            readonly input: H;
            readonly level: H extends `${infer _}.${string}` ? 1 : 2;
          }
        : never,
      ...RecursiveMap<Tail>,
    ]
  : [];

export type SolverTuple<T extends number> = BuildTuple<T> extends infer Row extends unknown[]
  ? {
      readonly row: Row;
      readonly depth: T;
    }
  : never;

export type ResolveRecursion<T extends string, N extends number> = N extends 0
  ? T
  : {
      readonly token: T;
      readonly nested: ResolveRecursion<T, Decrement<N>>;
      readonly tuple: BuildTuple<N>;
    };

export const asTuple = <N extends number>(count: N): BuildTuple<N> => {
  const output: unknown[] = [];
  while (output.length < count) {
    output.push({ index: output.length });
  }
  return output as BuildTuple<N>;
};

export const recursiveFold = <T extends readonly string[]>(items: T): RecursiveFold<T, 12> => {
  const result: unknown[] = [];
  for (const item of items) {
    result.push({
      value: `${item}::folded`,
      level: 12,
    });
  }
  return result as RecursiveFold<T, 12>;
};

export const recursiveSum = (values: readonly number[], limit: number): number => {
  if (limit === 0 || values.length === 0) {
    return 0;
  }
  const [head, ...tail] = values;
  return head + recursiveSum(tail, limit - 1);
};

export const recursiveMap = <T extends readonly string[]>(items: T): RecursiveMap<T> => {
  return items.map((item) => ({
    label: `map:${item}`,
    input: item,
    level: item.includes('.') ? 1 : 2,
  })) as RecursiveMap<T>;
};

export const buildMutualCycle = <
  A extends string,
  B extends string,
  Depth extends number,
>(a: A, b: B, depth: Depth): ResolveRecursion<`${A}-${B}`, Depth> => {
  const step: { token: string; nested: unknown } = {
    token: `${a}-${b}`,
    nested: { token: `${b}-${a}`, nested: null },
  };
  const build = <T>(payload: { token: string; nested: unknown; steps: number }): T => {
    if (payload.steps <= 0) {
      return { token: payload.token } as T;
    }
    return build({ token: `${payload.token}-${payload.steps}`, nested: payload.nested, steps: payload.steps - 1 }) as T;
  };

  return {
    token: `${a}-${b}`,
    nested: build({ token: `${b}-${a}`, nested: null, steps: depth as number - 1 }) as ResolveRecursion<string, Decrement<Depth>>,
    tuple: asTuple(depth),
  } as ResolveRecursion<`${A}-${B}`, Depth>;
};

export const tupleCascade = <
  T extends number,
>(depth: T) => {
  const recursive = (cursor: number): unknown => {
    if (cursor <= 0) {
      return { at: 0, trace: [] };
    }
    return {
      at: cursor,
      trace: [cursor, ...(recursive(cursor - 1) as { trace: unknown[] }).trace],
    };
  };

  return recursive(depth as number) as {
    readonly depth: T;
    readonly matrix: BuildTuple<T>;
    readonly resolved: ResolveRecursion<'root', T>;
  };
};

export type RecursiveString<T extends string, N extends number> = N extends 0
  ? T
  : `${T}-${RecursiveString<T, Decrement<N>>}`;

export const buildRecursiveString = <
  T extends string,
  N extends number,
>(seed: T, depth: N): RecursiveString<T, N> => {
  const out: string[] = [seed];
  for (let index = 0; index < depth; index += 1) {
    out.push(seed);
  }
  return out.join('-') as RecursiveString<T, N>;
};

export const synthesizeDepth = {
  asTuple,
  recursiveFold,
  recursiveMap,
  recursiveSum,
  buildRecursiveString,
  tupleCascade,
  buildMutualCycle,
};
