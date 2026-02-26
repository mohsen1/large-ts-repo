interface StageAnchor {
  readonly domain: string;
  readonly id: string;
  readonly sequence: number;
}

interface StageNode<
  TName extends string,
  TIndex extends number,
  TVersion extends number,
> extends StageAnchor {
  readonly kind: TName;
  readonly sequence: TIndex;
  readonly version: TVersion;
  readonly payload: {
    readonly source: string;
    readonly stage: TName;
    readonly tags: readonly [TName, `${TIndex}`, `${TVersion}`];
  };
  readonly next?: unknown;
}

type StageLink<TPrev extends StageNode<string, number, number>> = {
  readonly predecessor: TPrev;
  readonly predecessorDomain: TPrev['domain'];
};

export interface StageA extends StageNode<'A', 1, 1>, StageLink<StageA> {
  readonly next?: StageB;
}
export interface StageB extends StageNode<'B', 2, 2>, StageLink<StageA> {
  readonly next?: StageC;
}
export interface StageC extends StageNode<'C', 3, 3>, StageLink<StageB> {
  readonly next?: StageD;
}
export interface StageD extends StageNode<'D', 4, 4>, StageLink<StageC> {
  readonly next?: StageE;
}
export interface StageE extends StageNode<'E', 5, 5>, StageLink<StageD> {
  readonly next?: StageF;
}
export interface StageF extends StageNode<'F', 6, 6>, StageLink<StageE> {
  readonly next?: StageG;
}
export interface StageG extends StageNode<'G', 7, 7>, StageLink<StageF> {
  readonly next?: StageH;
}
export interface StageH extends StageNode<'H', 8, 8>, StageLink<StageG> {
  readonly next?: StageI;
}
export interface StageI extends StageNode<'I', 9, 9>, StageLink<StageH> {
  readonly next?: StageJ;
}
export interface StageJ extends StageNode<'J', 10, 10>, StageLink<StageI> {
  readonly next?: StageK;
}
export interface StageK extends StageNode<'K', 11, 11>, StageLink<StageJ> {
  readonly next?: StageL;
}
export interface StageL extends StageNode<'L', 12, 12>, StageLink<StageK> {
  readonly next?: StageM;
}
export interface StageM extends StageNode<'M', 13, 13>, StageLink<StageL> {
  readonly next?: StageN;
}
export interface StageN extends StageNode<'N', 14, 14>, StageLink<StageM> {
  readonly next?: StageO;
}
export interface StageO extends StageNode<'O', 15, 15>, StageLink<StageN> {
  readonly next?: StageP;
}
export interface StageP extends StageNode<'P', 16, 16>, StageLink<StageO> {
  readonly next?: StageQ;
}
export interface StageQ extends StageNode<'Q', 17, 17>, StageLink<StageP> {
  readonly next?: StageR;
}
export interface StageR extends StageNode<'R', 18, 18>, StageLink<StageQ> {
  readonly next?: StageS;
}
export interface StageS extends StageNode<'S', 19, 19>, StageLink<StageR> {
  readonly next?: StageT;
}
export interface StageT extends StageNode<'T', 20, 20>, StageLink<StageS> {
  readonly next?: StageU;
}
export interface StageU extends StageNode<'U', 21, 21>, StageLink<StageT> {
  readonly next?: StageV;
}
export interface StageV extends StageNode<'V', 22, 22>, StageLink<StageU> {
  readonly next?: StageW;
}
export interface StageW extends StageNode<'W', 23, 23>, StageLink<StageV> {
  readonly next?: StageX;
}
export interface StageX extends StageNode<'X', 24, 24>, StageLink<StageW> {
  readonly next?: StageY;
}
export interface StageY extends StageNode<'Y', 25, 25>, StageLink<StageX> {
  readonly next?: StageZ;
}
export interface StageZ extends StageNode<'Z', 26, 26>, StageLink<StageY> {
  readonly next?: never;
}

export type ChainTail = StageZ;

export type StageChainTail<T extends StageAnchor> = T extends StageZ
  ? 26
  : T extends StageY
    ? 25
    : T extends StageX
      ? 24
      : T extends StageW
        ? 23
        : T extends StageV
          ? 22
          : T extends StageU
            ? 21
            : T extends StageT
              ? 20
              : T extends StageS
                ? 19
                : T extends StageR
                  ? 18
                  : T extends StageQ
                    ? 17
                    : T extends StageP
                      ? 16
                      : T extends StageO
                        ? 15
                        : T extends StageN
                          ? 14
                          : T extends StageM
                            ? 13
                            : T extends StageL
                              ? 12
                              : T extends StageK
                                ? 11
                                : T extends StageJ
                                  ? 10
                                  : T extends StageI
                                    ? 9
                                    : T extends StageH
                                      ? 8
                                      : T extends StageG
                                        ? 7
                                        : T extends StageF
                                          ? 6
                                          : T extends StageE
                                            ? 5
                                            : T extends StageD
                                              ? 4
                                              : T extends StageC
                                                ? 3
                                                : T extends StageB
                                                  ? 2
                                                  : T extends StageA
                                                    ? 1
                                                    : never;

export type ChainDepth<T> = T extends StageAnchor ? StageChainTail<T> : never;

export type ChainLink<T extends StageAnchor> = T extends StageA
  ? StageB
  : T extends StageB
    ? StageC
    : T extends StageC
      ? StageD
      : T extends StageD
        ? StageE
        : T extends StageE
          ? StageF
          : T extends StageF
            ? StageG
            : T extends StageG
              ? StageH
              : T extends StageH
                ? StageI
                : T extends StageI
                  ? StageJ
                  : T extends StageJ
                    ? StageK
                    : T extends StageK
                      ? StageL
                      : T extends StageL
                        ? StageM
                        : T extends StageM
                          ? StageN
                          : T extends StageN
                            ? StageO
                            : T extends StageO
                              ? StageP
                              : T extends StageP
                                ? StageQ
                                : T extends StageQ
                                  ? StageR
                                  : T extends StageR
                                    ? StageS
                                    : T extends StageS
                                      ? StageT
                                      : T extends StageT
                                        ? StageU
                                        : T extends StageU
                                          ? StageV
                                          : T extends StageV
                                            ? StageW
                                            : T extends StageW
                                              ? StageX
                                              : T extends StageX
                                                ? StageY
                                                : T extends StageY
                                                  ? StageZ
                                                  : never;

export type ChainMap<
  T extends StageAnchor,
  TAcc = unknown,
> = T extends never ? TAcc : ChainMap<ChainLink<T>, TAcc & T>;

export const chainSequence: ReadonlyArray<StageAnchor> = [
  { domain: 'a', id: 'a01', sequence: 1 },
  { domain: 'b', id: 'b02', sequence: 2 },
  { domain: 'c', id: 'c03', sequence: 3 },
  { domain: 'd', id: 'd04', sequence: 4 },
  { domain: 'e', id: 'e05', sequence: 5 },
  { domain: 'f', id: 'f06', sequence: 6 },
  { domain: 'g', id: 'g07', sequence: 7 },
  { domain: 'h', id: 'h08', sequence: 8 },
  { domain: 'i', id: 'i09', sequence: 9 },
  { domain: 'j', id: 'j10', sequence: 10 },
  { domain: 'k', id: 'k11', sequence: 11 },
  { domain: 'l', id: 'l12', sequence: 12 },
  { domain: 'm', id: 'm13', sequence: 13 },
  { domain: 'n', id: 'n14', sequence: 14 },
  { domain: 'o', id: 'o15', sequence: 15 },
  { domain: 'p', id: 'p16', sequence: 16 },
  { domain: 'q', id: 'q17', sequence: 17 },
  { domain: 'r', id: 'r18', sequence: 18 },
  { domain: 's', id: 's19', sequence: 19 },
  { domain: 't', id: 't20', sequence: 20 },
  { domain: 'u', id: 'u21', sequence: 21 },
  { domain: 'v', id: 'v22', sequence: 22 },
  { domain: 'w', id: 'w23', sequence: 23 },
  { domain: 'x', id: 'x24', sequence: 24 },
  { domain: 'y', id: 'y25', sequence: 25 },
  { domain: 'z', id: 'z26', sequence: 26 },
];

export class ChainNodeClass0<
  TDomain extends string,
  TPayload = unknown,
  TSeed = { readonly seed: string },
  const TDepth extends number = 0,
> {
  constructor(
    readonly domain: TDomain,
    readonly depth: TDepth,
    readonly payload: TPayload,
    readonly token: TSeed,
  ) {}
  describe() {
    return `n${this.depth}:${this.domain}`;
  }
}

export class ChainNodeClass1<TDomain extends string, TPayload, TSeed>
  extends ChainNodeClass0<TDomain, TPayload, { readonly seed: TSeed }, 1>
{
  constructor(domain: TDomain, payload: TPayload, seed: TSeed, readonly next?: TSeed) {
    super(domain, 1, payload, { seed });
  }
}

export class ChainNodeClass2<TDomain extends string, TPayload, TSeed, TMeta>
  extends ChainNodeClass1<TDomain, TPayload, TSeed>
{
  constructor(domain: TDomain, payload: TPayload, seed: TSeed, meta: TMeta) {
    super(domain, payload, seed, seed);
    void meta;
  }
}

export class ChainNodeClass3<TDomain extends string, TPayload, TSeed, TMeta, TTag>
  extends ChainNodeClass2<TDomain, TPayload, TSeed, TMeta>
{
  constructor(domain: TDomain, payload: TPayload, seed: TSeed, meta: TMeta, readonly tag: TTag) {
    super(domain, payload, seed, meta);
    void tag;
  }
}

export class ChainNodeClass4<TDomain extends string, TPayload, TSeed, TMeta, TTag, TPath>
  extends ChainNodeClass3<TDomain, TPayload, TSeed, TMeta, TTag>
{
  constructor(domain: TDomain, payload: TPayload, seed: TSeed, meta: TMeta, tag: TTag, readonly path: TPath) {
    super(domain, payload, seed, meta, tag);
    void path;
  }
}

export class ChainNodeClass5<TDomain extends string, TPayload, TSeed, TMeta, TTag, TPath, TRoute>
  extends ChainNodeClass4<TDomain, TPayload, TSeed, TMeta, TTag, TPath>
{
  constructor(
    domain: TDomain,
    payload: TPayload,
    seed: TSeed,
    meta: TMeta,
    tag: TTag,
    path: TPath,
    readonly route: TRoute,
  ) {
    super(domain, payload, seed, meta, tag, path);
    void route;
  }
}

export type ChainMapProjection<T extends StageAnchor> = {
  readonly id: T['id'];
  readonly sequence: T['sequence'];
  readonly domain: T['domain'];
};

export type HierarchyNodeUnion =
  | StageA
  | StageB
  | StageC
  | StageD
  | StageE
  | StageF
  | StageG
  | StageH
  | StageI
  | StageJ
  | StageK
  | StageL
  | StageM
  | StageN
  | StageO
  | StageP
  | StageQ
  | StageR
  | StageS
  | StageT
  | StageU
  | StageV
  | StageW
  | StageX
  | StageY
  | StageZ;

export type DeepChain<T extends StageAnchor> = T extends StageA
  ? StageMap<T>
  : T extends StageB
    ? StageMap<T>
    : T extends StageC
      ? StageMap<T>
      : T extends StageD
        ? StageMap<T>
        : T extends StageE
          ? StageMap<T>
          : T extends StageF
            ? StageMap<T>
            : T extends StageG
              ? StageMap<T>
              : T extends StageH
                ? StageMap<T>
                : T extends StageI
                  ? StageMap<T>
                  : T extends StageJ
                    ? StageMap<T>
                    : T extends StageK
                      ? StageMap<T>
                      : T extends StageL
                        ? StageMap<T>
                        : T extends StageM
                          ? StageMap<T>
                          : T extends StageN
                            ? StageMap<T>
                            : T extends StageO
                              ? StageMap<T>
                              : T extends StageP
                                ? StageMap<T>
                                : T extends StageQ
                                  ? StageMap<T>
                                  : T extends StageR
                                    ? StageMap<T>
                                    : T extends StageS
                                      ? StageMap<T>
                                      : T extends StageT
                                        ? StageMap<T>
                                        : T extends StageU
                                          ? StageMap<T>
                                          : T extends StageV
                                            ? StageMap<T>
                                            : T extends StageW
                                              ? StageMap<T>
                                              : T extends StageX
                                                ? StageMap<T>
                                                : T extends StageY
                                                  ? StageMap<T>
                                                  : T extends StageZ
                                                    ? StageMap<T>
                                                    : never;

type StageMap<T extends StageAnchor> = {
  readonly stage: T;
  readonly depth: ChainDepth<T>;
  readonly next: ChainLink<T> | never;
};

export const chainHead: StageA = {
  domain: 'seed',
  id: 'seed-0',
  sequence: 0,
  version: 0,
  predecessor: undefined as never,
  predecessorDomain: 'seed',
  payload: { source: 'seed', stage: 'A', tags: ['A', '1', '1'] } as StageA['payload'],
  kind: 'A',
} as unknown as StageA;

export const chainCatalog: ReadonlyArray<HierarchyNodeUnion> = chainSequence.map((entry, index) => {
  const depth = index + 1;
  return {
    domain: entry.domain,
    id: entry.id,
    sequence: entry.sequence,
    version: depth,
    kind: String.fromCharCode(65 + index) as StageA['kind'],
    predecessor: undefined as never,
    predecessorDomain: entry.domain,
    payload: {
      source: chainSequence[Math.max(index - 1, 0)]?.domain ?? 'seed',
      stage: String.fromCharCode(65 + index),
      tags: [String.fromCharCode(65 + index), `${depth}`, `${Math.max(depth, 1)}`],
    },
    next: undefined,
  } as unknown as HierarchyNodeUnion;
}) as ReadonlyArray<HierarchyNodeUnion>;

export const chainDepth = chainCatalog.length;

export const flattenChainNodes = (nodes: readonly HierarchyNodeUnion[]): ChainMapProjection<StageAnchor>[] => {
  return nodes.map((node) => ({
    id: node.id,
    sequence: node.sequence,
    domain: node.domain,
  }));
};
