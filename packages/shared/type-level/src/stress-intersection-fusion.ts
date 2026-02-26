export type Id = string;
export type Stamp = number;

export interface AtlasMeta {
  readonly namespace: string;
  readonly version: number;
}

export interface SegmentA { readonly segmentA: 'a'; readonly id: Id; }
export interface SegmentB { readonly segmentB: 'b'; readonly stamp: Stamp; }
export interface SegmentC { readonly segmentC: 'c'; readonly enabled: boolean; }
export interface SegmentD { readonly segmentD: 'd'; readonly retries: number; }
export interface SegmentE { readonly segmentE: 'e'; readonly deadlineMs: number; }
export interface SegmentF { readonly segmentF: 'f'; readonly tags: readonly string[]; }
export interface SegmentG { readonly segmentG: 'g'; readonly labels: readonly string[]; }
export interface SegmentH { readonly segmentH: 'h'; readonly region: string; }
export interface SegmentI { readonly segmentI: 'i'; readonly score: number; }
export interface SegmentJ { readonly segmentJ: 'j'; readonly owner: string; }
export interface SegmentK { readonly segmentK: 'k'; readonly source: string; }
export interface SegmentL { readonly segmentL: 'l'; readonly checksum: string; }
export interface SegmentM { readonly segmentM: 'm'; readonly latency: number; }
export interface SegmentN { readonly segmentN: 'n'; readonly timeoutMs: number; }
export interface SegmentO { readonly segmentO: 'o'; readonly correlationId: string; }
export interface SegmentP { readonly segmentP: 'p'; readonly status: 'idle' | 'running' | 'blocked'; }
export interface SegmentQ { readonly segmentQ: 'q'; readonly priority: 'low' | 'medium' | 'high'; }
export interface SegmentR { readonly segmentR: 'r'; readonly runbookId: string; }
export interface SegmentS { readonly segmentS: 's'; readonly signalDensity: number; }
export interface SegmentT { readonly segmentT: 't'; readonly trend: readonly number[]; }
export interface SegmentU { readonly segmentU: 'u'; readonly urgency: number; }
export interface SegmentV { readonly segmentV: 'v'; readonly evidence: readonly string[]; }
export interface SegmentW { readonly segmentW: 'w'; readonly warnings: readonly string[]; }
export interface SegmentX { readonly segmentX: 'x'; readonly xray: boolean; }
export interface SegmentY { readonly segmentY: 'y'; readonly yield: number; }
export interface SegmentZ { readonly segmentZ: 'z'; readonly zone: string; }

export type FusionStack =
  & AtlasMeta
  & SegmentA
  & SegmentB;

export type NarrowedIntersection<T extends object> = T & {
  readonly meta: AtlasMeta;
};

export type ExpandSegment<T> = T extends { segmentA: infer _ }
  ? { [K in Extract<keyof T, string>]: T[K] }
  : never;

export type IntersectionIndex<K extends string[]> = {
  [P in K[number]]: P;
};

export type SegmentUnion =
  | SegmentA
  | SegmentB
  | SegmentC
  | SegmentD
  | SegmentE
  | SegmentF;

export type IntersectionCollapse<K extends readonly SegmentUnion[]> = K extends readonly [infer H, ...infer Rest]
  ? H extends SegmentUnion
    ? H & IntersectionCollapse<Rest & readonly SegmentUnion[]>
    : never
  : {};

export type FullFusion = SegmentA & SegmentB & AtlasMeta;

export type OverlapResolution<T extends SegmentUnion> = ExpandSegment<T>;

export type OverlapLookup = {
  readonly a: OverlapResolution<SegmentA>;
  readonly b: OverlapResolution<SegmentB>;
  readonly c: OverlapResolution<SegmentC>;
  readonly d: OverlapResolution<SegmentD>;
  readonly e: OverlapResolution<SegmentE>;
  readonly f: OverlapResolution<SegmentF>;
};

export const catalogBase: AtlasMeta = {
  namespace: 'fusion-core',
  version: 1,
};

export const collisionMatrix: IntersectionIndex<[
  'segmentA',
  'segmentB',
  'segmentC',
  'segmentD',
  'segmentE',
  'segmentF',
]> = {
  segmentA: 'segmentA',
  segmentB: 'segmentB',
  segmentC: 'segmentC',
  segmentD: 'segmentD',
  segmentE: 'segmentE',
  segmentF: 'segmentF',
};

export const buildFusion = (input: Partial<FullFusion>): FullFusion => {
  return {
    ...catalogBase,
    segmentA: 'a',
    id: 'seed-id',
    segmentB: 'b',
    stamp: 1,
    segmentC: 'c',
    enabled: false,
    segmentD: 'd',
    retries: 0,
    segmentE: 'e',
    deadlineMs: 0,
    segmentF: 'f',
    tags: [],
    ...input,
  } as FullFusion;
};
