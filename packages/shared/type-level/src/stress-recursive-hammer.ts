type NatList<T extends number, R extends never[] = []> = R['length'] extends T ? R : NatList<T, [never, ...R]>;
type Decrement<T extends number> = T extends 0 ? never : NatList<T> extends [never, ...infer Rest] ? Rest['length'] : never;
type Increment<T extends number> = [...NatList<T>, never]['length'];
type IsZero<T extends number> = T extends 0 ? true : false;

export type WrapDepth<T, D extends number> = {
  readonly depth: D;
  readonly value: T;
  readonly wrapped: true;
};

export type RecursiveTuple<T, N extends number, TOut extends readonly WrapDepth<T, number>[] = []> = N extends 0
  ? TOut
  : IsZero<N> extends true
    ? readonly [...TOut, WrapDepth<T, 0>]
    : RecursiveTuple<T, Decrement<N>, readonly [...TOut, WrapDepth<T, N>]>;

export type TailTuple<T extends readonly unknown[]> = T extends readonly [any, ...infer Rest] ? Rest : [];

export type BuildChain<T, N extends number> = N extends 0
  ? WrapDepth<T, 0>
  : N extends 1
    ? [WrapDepth<T, N>, WrapDepth<T, 0>]
    : BuildChainImpl<T, N>;

type BuildChainImpl<T, N extends number, Out extends readonly WrapDepth<T, number>[] = []> =
  N extends 0
    ? readonly [...Out, WrapDepth<T, 0>]
    : BuildChainImpl<T, Decrement<N>, readonly [...Out, WrapDepth<T, N>]>;

export type RecursiveUnion<T extends string, N extends number> = N extends 0
  ? `${T}:${N}`
  : `${T}:${N}` | RecursiveUnion<T, Decrement<N>>;

export type AccumulateTemplates<
  T extends ReadonlyArray<string>,
  N extends number,
  Acc extends readonly string[] = [],
> = N extends 0
  ? Acc
  : T extends readonly [infer H, ...infer Rest]
    ? H extends string
      ? AccumulateTemplates<
          Rest extends ReadonlyArray<string> ? Rest : [],
          Decrement<N>,
          [...Acc, `${H}:${N}`]
        >
      : Acc
    : Acc;

export type LayerNode<T, Depth extends number> = Depth extends 0
  ? { readonly value: T; readonly depth: 0; readonly children: undefined }
  : {
      readonly value: T;
      readonly depth: Depth;
      readonly children: LayerNode<T, Decrement<Depth>>;
    };

export type ResolverChain<TInput, TOutput, Depth extends number> = Depth extends 0
  ? (input: TInput) => TOutput
  : (input: TInput, depth: Depth) => ResolverChain<TInput, TOutput, Decrement<Depth>>;

export type MirrorUnion<
  A,
  B,
  C,
  Depth extends number = 16,
> = Depth extends 0
  ? A | B | C
  : MirrorUnion<{ left: A; right: B; depth: Depth }, MirrorUnion<A, C, B, Decrement<Depth>>, B, Decrement<Depth>>;

export type NodeSolver<
  T,
  N extends number,
  Out = T,
> = N extends 0
  ? { readonly value: Out; readonly solved: true }
  : { readonly value: Out; readonly solved: false; readonly next: NodeSolver<T, Decrement<N>, Array<Out>> };

export type WrapAccumulator<T, N extends number> = N extends 0
  ? readonly [WrapDepth<T, 0>]
  : readonly [WrapDepth<T, N>, ...WrapAccumulator<T, Decrement<N>>];

export const tupleSeed = <T, N extends number>(seed: T, depth: N): WrapAccumulator<T, N> => {
  const out: unknown[] = [];
  for (let index = Number(depth); index >= 0; index -= 1) {
    out.push({
      depth: 0,
      value: seed,
      wrapped: true,
    } as unknown as WrapDepth<T, N>);
  }
  return out as unknown as WrapAccumulator<T, N>;
};

type NodeA<T> = { readonly node: 'A'; readonly value: T };
type NodeB<T> = { readonly node: 'B'; readonly value: T };
type NodeC<T> = { readonly node: 'C'; readonly value: T };

export type MutRecursive<T, N extends number> = N extends 0
  ? NodeA<T>
  : N extends 1
    ? NodeB<T>
    : N extends 2
      ? NodeC<T>
      : MutRecursive<T, Decrement<N>> | MutRecursive<T, Decrement<Decrement<N>>>;

export type SolveMutualA<T, N extends number> = N extends 0 ? { ok: true; value: T } : SolveMutualB<MutRecursive<T, N>, Decrement<N>>;
export type SolveMutualB<T, N extends number> = N extends 0 ? { ok: false; value: T } : SolveMutualA<T, Decrement<N>>;

export const resolveTuple = <T, const N extends number>(value: T, depth: N): RecursiveTuple<T, N> => {
  const out: unknown[] = [];
  for (let cursor = 0; cursor < depth; cursor += 1) {
    out.push({
      depth: 0,
      value,
      wrapped: true,
    } as unknown as WrapDepth<T, N>);
  }
  return out as unknown as RecursiveTuple<T, N>;
};

export type TemplateRecursor<T extends string, Depth extends number> = Depth extends 0
  ? T
  : `${TemplateRecursor<T, Decrement<Depth>>}-${Depth}`;

export const resolveMutual = <T, const N extends number>(value: T): MutRecursive<T, N> => {
  return (Math.random() > 0.5 ? 1 : 0) > 0.4
    ? ({ node: 'A', value } as MutRecursive<T, N>)
    : ({ node: 'B', value } as MutRecursive<T, N>);
};

export type TreeDepth<T> = T extends LayerNode<infer _K, infer D> ? D : never;
