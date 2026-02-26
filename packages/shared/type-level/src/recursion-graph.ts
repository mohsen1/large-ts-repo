export type FiniteDepth = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type DecDepth<T extends FiniteDepth> =
  T extends 0 ? 0 : T extends 1 ? 0 : T extends 2 ? 1 : T extends 3 ? 2 : T extends 4 ? 3 : T extends 5 ? 4 : 3;

export type BuildTuple<Value, Length extends number, Acc extends readonly Value[] = []> =
  Acc['length'] extends Length ? Acc : BuildTuple<Value, Length, readonly [...Acc, Value]>;

export type GrowTuple<T extends readonly unknown[], Steps extends FiniteDepth, Seed extends readonly unknown[] = []> = Steps extends 0
  ? T
  : GrowTuple<[...T, ...Seed], DecDepth<Steps>, [never]>;

export type Decrement<N extends FiniteDepth> = N extends 0
  ? 0
  : BuildTuple<unknown, N> extends readonly [unknown, ...infer Tail]
    ? Tail['length']
    : 0;

export type GraphNodeState = 'seed' | 'expand' | 'leaf';

export type DepthFirstGraph<T, Depth extends FiniteDepth> = Depth extends 0
  ? { readonly state: 'leaf'; readonly value: T }
  : {
      readonly state: 'expand';
      readonly depth: Depth;
      readonly values: readonly [T, DepthFirstGraph<T, DecDepth<Depth>>, DepthFirstGraph<T, DecDepth<Depth>>];
    };

export type BreadthNode<T, Level extends FiniteDepth> =
  Level extends 0
    ? { readonly level: 0; readonly items: readonly [T] }
    : { readonly level: Level; readonly child: BreadthNode<T, DecDepth<Level>>[] };

export type ParseNumber<T extends string> = T extends `${infer Head}${infer Tail}`
  ? Head extends '-'
    ? never
    : Head extends `${number}`
      ? Tail extends ''
        ? Head
        : ParseNumber<Tail> extends infer R
          ? R extends string
            ? `${Head}${R}`
            : never
          : never
      : ParseNumber<Tail>
  : '';

export type IsNumericPath<T extends string> = ParseNumber<T> extends never ? false : true;

export type PathValue<T> = T extends `${infer A}/${infer B}` ? A | PathValue<B> : T;

export type RouteSegments<T extends string> = T extends `${infer Head}/${infer Rest}` ? Head | RouteSegments<Rest> : T;

export type AccumulateTuple<
  T extends readonly unknown[],
  Depth extends FiniteDepth,
  Acc extends readonly unknown[] = readonly [],
> = Depth extends 0 ? Acc : T extends readonly [infer H, ...infer R] ? AccumulateTuple<R, DecDepth<Depth>, readonly [...Acc, H]> : Acc;

export type Recursor<T, Depth extends FiniteDepth, Acc extends readonly unknown[]> =
  Depth extends 0
    ? Acc
    : T extends readonly []
    ? Acc
    : T extends readonly [infer H, ...infer R]
      ? Recursor<R, DecDepth<Depth>, readonly [...Acc, [Depth, H]]>
      : Acc;

export type ExpandChain<T extends FiniteDepth, Acc extends readonly number[] = []> = T extends 0
  ? Acc
  : ExpandChain<DecDepth<T>, readonly [...Acc, T]>;

export type TreeNode<T, Depth extends FiniteDepth> = Depth extends 0
  ? { readonly value: T; readonly state: GraphNodeState }
  : {
      readonly state: GraphNodeState;
      readonly left: TreeNode<T, DecDepth<Depth>>;
      readonly right: TreeNode<T, DecDepth<Depth>>;
      readonly values: readonly [T, ...readonly unknown[]];
    };

export type MutuallyRecursiveA<T extends string, Depth extends FiniteDepth> = Depth extends 0
  ? readonly [T]
  : {
      readonly head: T;
      readonly next: MutuallyRecursiveB<`${T}-b`, DecDepth<Depth>>;
    };

export type MutuallyRecursiveB<T extends string, Depth extends FiniteDepth> = Depth extends 0
  ? readonly [T]
  : {
      readonly head: T;
      readonly next: MutuallyRecursiveA<`${T}-a`, DecDepth<Depth>>;
    };

export type RecursiveAccumulator<T, N extends FiniteDepth, Acc extends readonly unknown[] = readonly []> =
  N extends 0
    ? { readonly done: true; readonly values: Acc; readonly value: T }
    : {
        readonly done: false;
        readonly values: readonly [...Acc, T];
        readonly recurse: RecursiveAccumulator<T, DecDepth<N>, readonly [...Acc, N]>;
      };

export type TupleRange<Start extends FiniteDepth, End extends FiniteDepth> = Start extends End
  ? readonly [Start]
  : Start extends 6
    ? readonly [6]
    : readonly [Start, ...TupleRange<DecDepth<Start>, End>];

export interface RecursiveTupleRunner<T extends FiniteDepth, Seed extends readonly unknown[] = readonly []> {
  readonly seed: Seed;
  readonly depth: T;
  build(next: number): Recursor<readonly [T, ...Seed], T, readonly []>;
}

export const buildDepthMatrix = (depth: number): number[][] => {
  const output: number[][] = [];
  for (let level = Math.max(0, Math.min(depth, 6)); level >= 0; level -= 1) {
    output.push(Array.from({ length: level + 1 }, (_, index) => index));
  }
  return output;
};

export const graphTraversal = <T>(start: T, depth: number): RecursiveAccumulator<T, 6> => {
  const out = {
    done: false,
    values: [start],
    recurse: {
      done: false,
      values: [start],
      recurse: {
        done: false,
        values: [start],
        recurse: {
          done: false,
          values: [start],
          recurse: {
            done: false,
            values: [start],
            recurse: {
              done: true,
              values: [start],
              value: start,
            },
          },
        },
      },
    },
  } as unknown as RecursiveAccumulator<T, 6>;
  return out;
};
