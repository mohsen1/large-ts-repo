export type Decrement<T extends number> =
  T extends 0
    ? 0
    : T extends 1
      ? 0
      : T extends 2
        ? 1
        : T extends 3
          ? 2
          : T extends 4
            ? 3
            : T extends 5
              ? 4
              : T extends 6
                ? 5
                : T extends 7
                  ? 6
                  : T extends 8
                    ? 7
                    : T extends 9
                      ? 8
                      : T extends 10
                        ? 9
                        : T extends 11
                          ? 10
                          : T extends 12
                            ? 11
                            : T extends 13
                              ? 12
                              : T extends 14
                                ? 13
                                : T extends 15
                                  ? 14
                                  : T extends 16
                                    ? 15
                                    : T extends 17
                                      ? 16
                                      : T extends 18
                                        ? 17
                                        : T extends 19
                                          ? 18
                                          : T extends 20
                                            ? 19
                                            : T extends 21
                                              ? 20
                                              : T extends 22
                                                ? 21
                                                : T extends 23
                                                  ? 22
                                                  : T extends 24
                                                    ? 23
                                                    : T extends 25
                                                      ? 24
                                                      : T extends 26
                                                        ? 25
                                                        : T extends 27
                                                          ? 26
                                                          : T extends 28
                                                            ? 27
                                                            : T extends 29
                                                              ? 28
                                                              : T extends 30
                                                                ? 29
                                                                : never;

export type BuildTuple<N extends number, T extends readonly unknown[] = []> = T['length'] extends N
  ? T
  : BuildTuple<N, [...T, { readonly index: T['length'] }]>;

export type TupleLength<T extends readonly unknown[]> = T['length'];

export type ExpandPayload<T, Depth extends number = 15> =
  Depth extends 0
    ? T
    : T extends Record<string, unknown>
      ? {
          readonly [K in keyof T]: ExpandPayload<T[K], Decrement<Depth>>;
        }
      : T;

export type BrokerSlot<T, Depth extends number> = {
  readonly slot: T;
  readonly depth: Depth;
  readonly children: readonly BrokerSlot<T, Decrement<Depth>>[];
};

export type BuildBrokerGraph<T extends number, Payload> =
  T extends 0
    ? readonly []
    : [BrokerSlot<Payload, T>, ...BuildBrokerGraph<Decrement<T>, Payload>];

export type WrapPayload<T> = {
  readonly payload: T;
  readonly token: string;
};

export type BrokerFold<T, Acc extends readonly unknown[] = []> = T extends readonly [infer H, ...infer R]
  ? BrokerFold<R, [...Acc, WrapPayload<H>]>
  : Acc;

export type FoldUntil<T extends readonly unknown[], Limit extends number, N extends number = Limit> =
  T extends readonly [infer Head, ...infer Tail extends readonly unknown[]]
    ? N extends 0
      ? readonly []
      : readonly [
          { readonly head: Head; readonly n: N },
          ...FoldUntil<Tail, Limit, Decrement<N>>,
        ]
    : readonly [];

export type BrokerChain<T extends number, P> = T extends 0
  ? { readonly level: T; readonly payload: P; readonly next?: undefined }
  : { readonly level: T; readonly payload: P; readonly next: BrokerChain<Decrement<T>, ExpandPayload<P, T>> };

export type EmitChain<T extends number, P> =
  BuildTuple<T> extends infer Seed extends readonly unknown[]
    ? BrokerChain<T, ExpandPayload<P, Seed['length']>>
    : never;

export type ExpandTree<T, Acc extends readonly unknown[], N extends number = 15> = N extends 0
  ? { readonly item: T; readonly acc: Acc }
  : T extends [infer Left, ...infer Right extends readonly unknown[]]
    ? { readonly item: Left; readonly acc: Acc; readonly rest: ExpandTree<Right, [...Acc, Left], Decrement<N>> }
    : { readonly item: T; readonly acc: Acc };

export type ResolveTupleDepth<T extends readonly unknown[]> =
  T extends [unknown, ...infer Rest]
    ? 1 | (1 extends 1 ? ResolveTupleDepth<Rest> : never)
    : 0;

export type BrokerStateMatrix<T extends number, U extends number = T> = {
  readonly row: T;
  readonly columns: BrokerStateMatrix<Decrement<T>, U>;
} & (T extends 0 ? { readonly done: true } : { readonly done: false; readonly width: U });

export interface RuntimeBroker<T extends readonly unknown[]> {
  readonly pipeline: T;
  readonly stepCount: T['length'];
}

export type RecursiveMutualBroker<T, C extends number> = C extends 0
  ? WrapPayload<T>
  : RecursiveMutualCarrier<WrapPayload<T>, C>;

export type RecursiveMutualCarrier<T, C extends number> = C extends 0
  ? { readonly payload: T; readonly sink: 'empty' }
  : { readonly payload: T; readonly sink: 'active'; readonly child: RecursiveMutualBroker<WrapPayload<T>, Decrement<C>> };

export const buildBrokerTuple = <N extends number>(limit: N): BuildTuple<N> => {
  const tuple: unknown[] = [];
  for (let i = 0; i < limit; i += 1) {
    tuple.push({ index: i });
  }
  return tuple as BuildTuple<N>;
};

export const buildBrokerFold = <T>(input: readonly T[]): ReadonlyArray<WrapPayload<T>> => {
  return input.map((item) => ({ payload: item, token: `tok-${String(item)}` }) as WrapPayload<T>);
};

export const normalizeBroker = (node: BrokerSlot<string, number>, depth: number): string[] => {
  if (depth <= 0) {
    return [node.slot];
  }
  const next: string[] = node.children.flatMap((child) => normalizeBroker(child, depth - 1));
  return [node.slot, ...next];
};

export const buildRecursiveChain = <T>(value: T, depth: number): BrokerChain<number, T> => {
  const asAny = value as T;
  return {
    level: depth,
    payload: asAny,
    next: depth > 0
      ? (buildRecursiveChain(value, depth - 1) as BrokerChain<number, T>["next"])
      : undefined,
  } as BrokerChain<number, T>;
};

export const brokerCatalog = (
  roots: readonly string[],
): RuntimeBroker<readonly {
  readonly slot: string;
  readonly path: string[];
}[]> => {
  const pipeline = roots.map((root, index) => ({
    slot: root,
    path: [
      `L${index}`,
      `D${roots.length}`,
      `R${root.length}`,
    ],
  }));

  return {
    pipeline,
    stepCount: pipeline.length,
  } as RuntimeBroker<readonly { readonly slot: string; readonly path: string[] }[]>;
};

export const chainResolver = <T, N extends number>(seed: T, limit: N): string[] => {
  const tuple = buildTupleRecursive(String(limit).length);
  return tuple.map((item) => `${(item as { readonly index: string | number }).index}-${String(seed)}`);
};

export const buildTupleRecursive = <N extends number>(size: N): BuildTuple<N> => {
  const result: unknown[] = [];
  for (let i = 0; i < size; i += 1) {
    result.push({ index: i });
  }
  return result as BuildTuple<N>;
};

export const expandChain = <N extends number, P>(payload: P, depth: N): RecursiveMutualBroker<P, N> => {
  const wrap = (value: P, level: number): RecursiveMutualBroker<P, number> =>
    ({
      payload: { payload: value, token: `tok-${level}` } as WrapPayload<P>,
      sink: level > 0 ? 'active' : 'empty',
      child: level > 0 ? wrap(value, level - 1) : undefined,
    }) as RecursiveMutualBroker<P, number>;

  return wrap(payload, depth) as RecursiveMutualBroker<P, N>;
};
