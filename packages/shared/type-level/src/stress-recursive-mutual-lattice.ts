export type BuildTuple<N extends number, T extends unknown[] = []> = T['length'] extends N
  ? T
  : BuildTuple<N, [unknown, ...T]>;

export type HeadTail<T extends unknown[]> = T extends [infer H, ...infer R]
  ? { readonly head: H; readonly tail: R }
  : never;

export type Decrement<N extends number> = BuildTuple<N> extends [...infer R, unknown] ? R['length'] : 0;

export type GrowTuple<
  N extends number,
  Seed extends string = '',
  Acc extends string[] = []
> = Acc['length'] extends N
  ? Acc
  : GrowTuple<N, `${Seed}x`, [...Acc, `${Seed}${Acc['length']}`]>;

export type ConcatTuple<A extends string[], B extends string[]> = [...A, ...B];

export type UnionToArray<T, TAccumulator extends T[] = []> = T extends infer Item
  ? Item extends T
    ? TAccumulator | [Item]
    : never
  : TAccumulator;

export type MutRecPhaseA<
  TDomain extends string,
  TDepth extends number,
  TTrail extends string[] = [],
> = TDepth extends 0
  ? { readonly phase: 'A'; readonly domain: TDomain; readonly trace: TTrail; readonly depth: 0 }
  : MutRecPhaseB<
      TDomain,
      Decrement<TDepth>,
      ConcatTuple<TTrail, GrowTuple<2, `${TDomain}-A`, []>>
    >;

export type MutRecPhaseB<
  TDomain extends string,
  TDepth extends number,
  TTrail extends string[] = [],
> = TDepth extends 0
  ? { readonly phase: 'B'; readonly domain: TDomain; readonly trace: TTrail; readonly depth: 0 }
  : MutRecPhaseA<
      TDomain,
      Decrement<TDepth>,
      ConcatTuple<TTrail, GrowTuple<3, `${TDomain}-B`, []>>
    >;

export type RecursivePulse<
  TDomain extends string,
  TDepth extends number,
  TTrail extends string[] = [],
> = MutRecPhaseA<TDomain, TDepth, TTrail> | MutRecPhaseB<TDomain, TDepth, TTrail>;

export type ResolvePulse<
  TDomain extends string,
  TDepth extends number,
> = RecursivePulse<TDomain, TDepth> extends infer Result
  ? Result & { readonly resolvedAt: TDepth }
  : never;

export type PulseDepthTree<
  TDomain extends string,
  TDepth extends number,
  TLevel extends number[] = [],
  TOut = never,
> = TDepth extends TLevel['length']
  ? TOut | { readonly step: TLevel['length']; readonly domain: TDomain; readonly trace: TLevel }
  : PulseDepthTree<TDomain, TDepth, [...TLevel, TLevel['length']], TOut | { readonly step: TLevel['length']; readonly domain: TDomain }>;

export type SignalPath<TDepth extends number> = TDepth extends 0
  ? 'start'
  : `depth-${TDepth}` | SignalPath<Decrement<TDepth>>;

export type SolverTrace<
  TDepth extends number,
  TSeed extends string = 'root',
  TAccum extends readonly string[] = [],
> = TDepth extends 0
  ? {
      readonly seed: TSeed;
      readonly route: TAccum;
      readonly complete: true;
    }
  : {
      readonly seed: TSeed;
      readonly route: readonly string[];
      readonly complete: false;
    };

export const recursiveTupleBuilders = <N extends number>(depth: N) => {
  const trail: string[] = [];
  const run = (steps: number): string[] => {
    const current = steps;
    trail.push(`step-${current}`);
    if (steps <= 0) {
      return [...trail];
    }
    return run(steps - 1);
  };
  return run(depth);
};

export type RecursiveConstraintEnvelope<TVerb extends string, TDepth extends number> = {
  readonly verb: TVerb;
  readonly trace: ReadonlyArray<string>;
  readonly nested: ResolvePulse<TVerb, TDepth>;
};

export const resolveMutualLattice = <TVerb extends string, TDepth extends number>(
  verb: TVerb,
  depth: TDepth,
): RecursiveConstraintEnvelope<TVerb, TDepth> => {
  return {
    verb,
    trace: recursiveTupleBuilders(depth),
    nested: null as never,
  };
};
