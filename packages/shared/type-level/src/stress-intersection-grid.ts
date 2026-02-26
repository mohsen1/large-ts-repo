import type { NoInferAdvanced } from './composition-labs';

type LayerA = { readonly layer: 'A'; readonly active: boolean; readonly shared: { weight: number }; readonly a?: string };
type LayerB = { readonly layer: 'B'; readonly active: boolean; readonly shared: { weight: number; category: 'primary' }; readonly b?: string };
type LayerC = { readonly layer: 'C'; readonly count: number; readonly shared: { weight: number; score: number } };
type LayerD = { readonly layer: 'D'; readonly count: number; readonly metrics: { baseline: number }; readonly c?: number };
type LayerE = { readonly layer: 'E'; readonly count: number; readonly metrics: { baseline: number; ceiling: number } };
type LayerF = { readonly layer: 'F'; readonly enabled: true | false; readonly metrics: { baseline: number; ceiling: number; floor: number } };
type LayerG = { readonly layer: 'G'; readonly enabled: true | false; readonly tags: readonly string[] };
type LayerH = { readonly layer: 'H'; readonly enabled: true | false; readonly tags: readonly string[]; readonly label: `h-${string}` };
type LayerI = { readonly layer: 'I'; readonly id: `id-${string}`; readonly tags: readonly string[]; readonly rank: number };
type LayerJ = { readonly layer: 'J'; readonly id: `id-${string}`; readonly rank: number; readonly rankHint: number };
type LayerK = { readonly layer: 'K'; readonly policy: { action: 'allow' | 'deny'; reason?: string } };
type LayerL = { readonly layer: 'L'; readonly policy: { action: 'allow' | 'deny'; reason?: string; ttl: number } };
type LayerM = { readonly layer: 'M'; readonly policy: { action: 'allow' | 'deny'; ttl: number; overrides: readonly string[] } };
type LayerN = { readonly layer: 'N'; readonly policy: { action: 'allow' | 'deny'; ttl: number; overrides: readonly string[]; flags: Record<string, boolean> } };
type LayerO = { readonly layer: 'O'; readonly policy: { action: 'allow' | 'deny'; ttl: number; overrides: readonly string[]; notes: string[] } };
type LayerP = { readonly layer: 'P'; readonly policy: { action: 'allow' | 'deny' }; readonly notes: string[] };
type LayerQ = { readonly layer: 'Q'; readonly policy: { action: 'allow' | 'deny' }; readonly scope: { zones: readonly string[] } };
type LayerR = { readonly layer: 'R'; readonly policy: { action: 'allow' | 'deny' }; readonly scope: { zones: readonly string[]; regions: readonly string[] } };
type LayerS = { readonly layer: 'S'; readonly budget: number; readonly currency: 'USD' | 'EUR' };
type LayerT = { readonly layer: 'T'; readonly budget: number; readonly currency: 'USD' | 'EUR'; readonly taxes: number };
type LayerU = { readonly layer: 'U'; readonly budget: number; readonly currency: 'USD' | 'EUR'; readonly taxes: number; readonly net: number };
type LayerV = { readonly layer: 'V'; readonly budget: number; readonly currency: 'USD' | 'EUR'; readonly taxes: number; readonly net: number; readonly gross: number };
type LayerW = { readonly layer: 'W'; readonly state: 'queued' | 'active' | 'finalizing' };
type LayerX = { readonly layer: 'X'; readonly state: 'queued' | 'active' | 'finalizing'; readonly reason?: string };
type LayerY = { readonly layer: 'Y'; readonly state: 'queued' | 'active' | 'finalizing'; readonly tags: readonly string[]; readonly reason?: string };
type LayerZ = { readonly layer: 'Z'; readonly checksum: string; readonly fingerprint: string };
type LayerAA = { readonly layer: 'AA'; readonly checksum: string; readonly fingerprint: string; readonly hash: string };
type LayerAB = { readonly layer: 'AB'; readonly checksum: string; readonly fingerprint: string; readonly hash: string; readonly salt: string };
type LayerAC = { readonly layer: 'AC'; readonly checksum: string; readonly fingerprint: string; readonly hash: string; readonly salt: string; readonly version: number };
type LayerAD = { readonly layer: 'AD'; readonly checksum: string; readonly fingerprint: string; readonly version: number; readonly owner: string };
type LayerAE = { readonly layer: 'AE'; readonly checksum: string; readonly owner: string; readonly ownerRegion: string };
type LayerAF = { readonly layer: 'AF'; readonly checksum: string; readonly owner: string; readonly ownerRegion: string; readonly contact: string };

export type CollisionLayer =
  | LayerA
  | LayerB
  | LayerC
  | LayerD
  | LayerE
  | LayerF
  | LayerG
  | LayerH
  | LayerI
  | LayerJ
  | LayerK
  | LayerL
  | LayerM
  | LayerN
  | LayerO
  | LayerP
  | LayerQ
  | LayerR
  | LayerS
  | LayerT
  | LayerU
  | LayerV
  | LayerW
  | LayerX
  | LayerY
  | LayerZ
  | LayerAA
  | LayerAB
  | LayerAC
  | LayerAD
  | LayerAE
  | LayerAF;

export type FlattenedIntersection = LayerA &
  LayerB &
  LayerC &
  LayerD &
  LayerE &
  LayerF &
  LayerG &
  LayerH &
  LayerI &
  LayerJ &
  LayerK &
  LayerL &
  LayerM &
  LayerN &
  LayerO &
  LayerP &
  LayerQ &
  LayerR &
  LayerS &
  LayerT &
  LayerU &
  LayerV &
  LayerW &
  LayerX &
  LayerY &
  LayerZ &
  LayerAA &
  LayerAB &
  LayerAC &
  LayerAD &
  LayerAE &
  LayerAF;

export type IntersectedUnion<T extends readonly unknown[]> = T[number] & {};
export type NormalizeIntersect<T> = T extends FlattenedIntersection
  ? Omit<T, 'policy' | 'shared' | 'metrics' | 'state' | 'scope' | 'tags' | 'id' | 'checksum' | 'layer' | 'active' | 'enabled' | 'count'>
  : never;

export type ExpandLayers<T> = T extends infer C
  ? {
      [K in keyof C]:
        C[K] extends (...args: readonly unknown[]) => unknown
          ? C[K]
          : C[K] extends Record<string, unknown>
            ? { [Q in keyof C[K]]: C[K][Q] }
            : C[K];
    }
  : never;

export type ResolveIntersection<TA extends FlattenedIntersection, TB extends FlattenedIntersection> = TA & TB;

export type BuildIntersection<TLeft extends readonly FlattenedIntersection[], TRight extends readonly FlattenedIntersection[]> = TLeft extends readonly [
  infer LeftHead,
  ...infer LeftTail,
]
  ? TRight extends readonly [infer RightHead, ...infer RightTail]
    ? LeftHead & RightHead & BuildIntersection<
        LeftTail extends readonly FlattenedIntersection[] ? LeftTail : [],
        RightTail extends readonly FlattenedIntersection[] ? RightTail : []
      >
    : LeftHead
  : TRight extends readonly [infer RightHead, ...infer RightTail]
    ? RightHead & BuildIntersection<[], RightTail extends readonly FlattenedIntersection[] ? RightTail : []>
    : {};

export type FlattenedGridPayload = IntersectedUnion<[LayerA, LayerB, LayerC, LayerD, LayerE, LayerF, LayerG, LayerH, LayerI, LayerJ, LayerK, LayerL, LayerM, LayerN, LayerO, LayerP, LayerQ, LayerR, LayerS, LayerT, LayerU, LayerV, LayerW, LayerX, LayerY, LayerZ, LayerAA, LayerAB, LayerAC, LayerAD, LayerAE, LayerAF]>;

export type ReconcilePair<T> = T extends any[]
  ? {
      readonly left: T[0];
      readonly right: T[1];
    }
  : never;

export type MergeIntersections<T extends FlattenedIntersection[]> = T extends readonly [infer Head, ...infer Tail]
  ? Head & MergeIntersections<Tail extends FlattenedIntersection[] ? Tail : []>
  : {};

export const makeIntersection = <
  const TLeft extends FlattenedIntersection,
  const TRight extends FlattenedIntersection,
>(
  left: TLeft,
  right: TRight,
): ResolveIntersection<TLeft, TRight> => ({ ...left, ...right }) as ResolveIntersection<TLeft, TRight>;

export const buildFlattenedIntersection = (
  ...parts: readonly FlattenedIntersection[]
): FlattenedIntersection => {
  const out: Record<string, unknown> = {};
  for (const part of parts) {
    for (const entry of Object.entries(part)) {
      const [key, value] = entry;
      if (value !== undefined) {
        out[key] = value;
      }
    }
  }
  return out as FlattenedIntersection;
};

export const reconcileIntersections = (
  left: FlattenedIntersection,
  right: FlattenedIntersection,
): {
  readonly input: ReconcilePair<[FlattenedIntersection, FlattenedIntersection]>;
  readonly value: FlattenedIntersection;
  readonly keys: readonly (keyof FlattenedIntersection)[];
} => {
  const merged = buildFlattenedIntersection(left, right);
  return {
    input: {
      left,
      right,
    },
    value: merged,
    keys: Object.keys(merged) as (keyof FlattenedIntersection)[],
  };
};

export type IntersectMap<T> = {
  readonly [K in keyof T as K extends string ? `ix:${K}` : never]: K extends keyof FlattenedIntersection
    ? FlattenedIntersection[K]
    : never;
};

export const projectIntersection = <T extends object>(candidate: T): IntersectMap<T> =>
  candidate as IntersectMap<T>;

export const normalizeIntersection = (items: readonly NoInferAdvanced<FlattenedIntersection>[]): FlattenedIntersection[] =>
  items.map((item) => item);
