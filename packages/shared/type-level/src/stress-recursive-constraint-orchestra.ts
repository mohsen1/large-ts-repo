export type Increment<N extends number> = [...Array<N>, 1]['length'] & number;
export type Decrement<N extends number> = N extends 0 ? 0 : BuildTuple<N> extends [unknown, ...infer Rest] ? Rest['length'] & number : never;

export type BuildTuple<N extends number, Acc extends readonly unknown[] = []> = Acc['length'] extends N
  ? Acc
  : BuildTuple<N, [...Acc, unknown]>;

export type Natural = BuildTuple<number>;

export type Fill<T, N extends number> = N extends 0
  ? []
  : [T, ...Fill<T, Decrement<N>>];

export type Wrap<T> = {
  readonly item: T;
  readonly items: readonly T[];
};

export type DeepRecursive<T, N extends number> =
  N extends 0
    ? T
    : DeepRecursive<Wrap<T>, Decrement<N>>;

export type MutateA<T, N extends number> =
  N extends 0
    ? T
    : MutateB<T, Decrement<N>, `a-${N}`>;

export type MutateB<T, N extends number, Trace extends string> =
  N extends 0
    ? T
    : MutateA<{ readonly value: T; readonly trace: Trace }, Decrement<N>>;

export type RecursionLedger<T extends string, N extends number> =
  DeepRecursive<T, N> extends infer X
    ? X extends { readonly item: infer I; readonly items: readonly (infer U)[] }
      ? { readonly terminal: I; readonly trace: readonly U[] }
      : never
    : never;

export type PipelineCell<T, K extends string = 'leaf'> = {
  readonly kind: K;
  readonly value: T;
};

export type PipelineStep<T, N extends number> = N extends 0
  ? PipelineCell<T, 'done'>
  : PipelineCell<T, `step-${N}`> & {
      readonly next: PipelineStep<T, Decrement<N>>;
    };

export type Accumulate<T, Depth extends number, Acc extends readonly unknown[] = []> = Depth extends 0
  ? Acc
  : Accumulate<T, Decrement<Depth>, [...Acc, T]>;

export type BuildAccumulator<T, Depth extends number> = {
  readonly items: Accumulate<T, Depth>;
  readonly size: Accumulate<T, Depth>['length'];
};

export type ConcatUnion<T, U> = T | U;

export type UnionFold<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? Head | UnionFold<Tail>
  : never;

export type NumericExpression =
  | { readonly op: 'add'; readonly left: number; readonly right: number }
  | { readonly op: 'mul'; readonly left: number; readonly right: number }
  | { readonly op: 'dec'; readonly value: number }
  | { readonly op: 'inc'; readonly value: number };

export type EvalExpr<T extends NumericExpression> = T extends { op: 'add'; left: infer L; right: infer R }
  ? L extends number
    ? R extends number
      ? L | R
      : never
    : never
  : T extends { op: 'mul'; left: infer L; right: infer R }
    ? L extends number
      ? R extends number
        ? L | R
        : never
      : never
    : T extends { op: 'inc'; value: infer V }
      ? V extends number
        ? Decrement<V>
        : never
      : T extends { op: 'dec'; value: infer V }
        ? V extends number
          ? Increment<V>
          : never
        : never;

export type EvaluatePipeline<T extends readonly NumericExpression[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? Head extends NumericExpression
      ? [EvalExpr<Head>, ...EvaluatePipeline<Tail & readonly NumericExpression[]>]
      : []
    : [];

export type RecursiveSolver<T, Steps extends readonly NumericExpression[]> = {
  readonly input: T;
  readonly plan: Steps;
  readonly results: EvaluatePipeline<Steps>;
  readonly snapshot: BuildAccumulator<T, Steps['length']>;
};

export type RecurseSolver<T extends string, Steps extends readonly NumericExpression[]> = RecursiveSolver<T, Steps>;

export const sequenceOfNumbers = <T, N extends number>(seed: T): BuildAccumulator<T, N> => ({
  items: [] as BuildAccumulator<T, N>['items'],
  size: 0 as BuildAccumulator<T, N>['size'],
} as BuildAccumulator<T, N>);

export type RouteTuple = [RawRoute, BuildAccumulator<string, 8>];

type RawRoute =
  | '/recover/fabric'
  | '/recover/signal'
  | '/simulate/fabric'
  | '/simulate/signal'
  | '/rollback/fabric';

export type RouterConfig<T extends RawRoute, N extends number> = {
  readonly route: T;
  readonly depth: N;
  readonly recursive: DeepRecursive<T, N>;
};

export type RecursiveMap<T> = T extends readonly unknown[]
  ? { [K in keyof T]: RouterConfig<RawRoute, K & number> }
  : never;

export type MutualAlpha<T, N extends number, Seed extends string = 'start'> =
  N extends 0 ? { seed: Seed; terminal: true; payload: T } : MutualBeta<T, Decrement<N>, `${Seed}|a${N}`>;

export type MutualBeta<T, N extends number, Seed extends string> =
  N extends 0 ? { seed: Seed; terminal: true; payload: T } : MutualGamma<T, Decrement<N>, `${Seed}|b${N}`>;

export type MutualGamma<T, N extends number, Seed extends string> =
  N extends 0 ? { seed: Seed; terminal: true; payload: T } : MutualAlpha<T, Decrement<N>, `${Seed}|g${N}`>;

export type FoldRecursive<T, N extends number> = MutualAlpha<T, N>;

export const recursiveSeed: RouteTuple = ['/recover/fabric', sequenceOfNumbers<string, 8>('bootstrap')];

export const routeBlueprints = {
  primary: ['/recover/fabric', '/recover/signal', '/simulate/fabric'] as const,
  secondary: ['/simulate/signal', '/rollback/fabric'] as const,
  tertiary: [] as const,
};

export type BlueprintRoutes = (typeof routeBlueprints.primary)[number] | (typeof routeBlueprints.secondary)[number];

export const resolverTree = {
  recover: {
    fabric: [0, 1, 2, 3],
    signal: [1, 2, 3],
  },
  simulate: {
    fabric: [2, 3, 4],
    signal: [3, 4],
  },
  rollback: {
    fabric: [4, 5, 6],
  },
} as const;

export type RouteResolver = keyof typeof resolverTree;

export type ResolverPayload<T extends RouteResolver> =
  T extends 'recover'
    ? typeof resolverTree.recover.fabric
    : T extends 'simulate'
      ? typeof resolverTree.simulate.fabric | typeof resolverTree.simulate.signal
      : T extends 'rollback'
        ? typeof resolverTree.rollback.fabric
        : [];

export type ResolverAccum<T extends RouteResolver> = BuildAccumulator<ResolverPayload<T>[number], ResolverPayload<T> extends readonly number[] ? ResolverPayload<T>['length'] : 0>;

export const resolveRecursive = <T extends RouteResolver>(route: T): ResolverAccum<T> => ({
  items: [] as unknown as ResolverAccum<T>['items'],
  size: 0 as ResolverAccum<T>['size'],
} as unknown as ResolverAccum<T>);

export type FoldedRecursive = {
  readonly recover: FoldRecursive<string, 18>;
  readonly simulate: FoldRecursive<number, 14>;
  readonly rollback: FoldRecursive<{ readonly route: string }, 10>;
};

export const foldedBlueprint: FoldedRecursive = {
  recover: resolveRecursive('recover') as unknown as FoldRecursive<string, 18>,
  simulate: resolveRecursive('simulate') as unknown as FoldRecursive<number, 14>,
  rollback: resolveRecursive('rollback') as unknown as FoldRecursive<{ readonly route: string }, 10>,
};

export type PipelineMatrix = {
  [K in BlueprintRoutes]: RouteResolver;
};

export const matrix: PipelineMatrix = {
  '/recover/fabric': 'recover',
  '/recover/signal': 'recover',
  '/simulate/fabric': 'simulate',
  '/simulate/signal': 'simulate',
  '/rollback/fabric': 'rollback',
};

export type AccumulatorResult = ReturnType<typeof resolveRecursive<'recover'>>;
