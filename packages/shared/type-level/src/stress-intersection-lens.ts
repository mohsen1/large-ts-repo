export type LensToken =
  | 'alpha'
  | 'bravo'
  | 'charlie'
  | 'delta'
  | 'echo'
  | 'foxtrot'
  | 'golf'
  | 'hotel'
  | 'india'
  | 'juliet'
  | 'kilo'
  | 'lima'
  | 'mike'
  | 'november'
  | 'oscar'
  | 'papa'
  | 'quebec'
  | 'romeo'
  | 'sierra'
  | 'tango'
  | 'uniform'
  | 'victor'
  | 'whiskey'
  | 'xray'
  | 'yankee'
  | 'zulu';

export type ReadonlyLens<T> = { readonly [K in keyof T]: T[K] };

export interface LensShapeA { readonly scope: 'scopeA'; readonly metrics: { readonly a: number; readonly b: number }; readonly tags: readonly ['a', 'b']; }
export interface LensShapeB { readonly scope: 'scopeB'; readonly metrics: { readonly c: string; readonly d: string }; readonly tags: readonly ['c', 'd']; }
export interface LensShapeC { readonly scope: 'scopeC'; readonly metrics: { readonly e: boolean; readonly f: boolean }; readonly tags: readonly ['e', 'f']; }
export interface LensShapeD { readonly scope: 'scopeD'; readonly metrics: { readonly g: Date; readonly h: Date }; readonly tags: readonly ['g', 'h']; }
export interface LensShapeE { readonly scope: 'scopeE'; readonly metrics: { readonly i: number | string; readonly j: number | string }; readonly tags: readonly ['i', 'j']; }
export interface LensShapeF { readonly scope: 'scopeF'; readonly metrics: { readonly k: symbol; readonly l: string }; readonly tags: readonly ['k', 'l']; }
export interface LensShapeG { readonly scope: 'scopeG'; readonly metrics: { readonly m: bigint; readonly n: bigint }; readonly tags: readonly ['m', 'n']; }
export interface LensShapeH { readonly scope: 'scopeH'; readonly metrics: { readonly o: null; readonly p: undefined }; readonly tags: readonly ['o', 'p']; }
export interface LensShapeI { readonly scope: 'scopeI'; readonly metrics: { readonly q: RegExp; readonly r: Error }; readonly tags: readonly ['q', 'r']; }
export interface LensShapeJ { readonly scope: 'scopeJ'; readonly metrics: { readonly s: Map<string, string>; readonly t: Set<number> }; readonly tags: readonly ['s', 't']; }
export interface LensShapeK { readonly scope: 'scopeK'; readonly metrics: { readonly u: WeakMap<object, string>; readonly v: WeakSet<object> }; readonly tags: readonly ['u', 'v']; }
export interface LensShapeL { readonly scope: 'scopeL'; readonly metrics: { readonly w: Promise<string>; readonly x: Promise<number> }; readonly tags: readonly ['w', 'x']; }

export type LensCatalog =
  | LensShapeA
  | LensShapeB
  | LensShapeC
  | LensShapeD
  | LensShapeE
  | LensShapeF
  | LensShapeG
  | LensShapeH
  | LensShapeI
  | LensShapeJ
  | LensShapeK
  | LensShapeL;

export type OverlapMerge<A, B> = A extends object
  ? B extends object
    ? {
        [K in keyof A | keyof B]: K extends keyof B
          ? K extends keyof A
            ? A[K] | B[K]
            : B[K]
          : K extends keyof A
            ? A[K]
            : never;
      }
    : A
  : B;

export type IntersectTuple<T extends readonly unknown[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? Head & IntersectTuple<Tail>
    : {};

export type FilterScope<T, K extends string> = T extends { readonly scope: K } ? T : never;

export type ScopeMap<T extends LensCatalog> = {
  [K in T['scope']]: Extract<T, { readonly scope: K }>;
};

export type BuildIntersections<T extends readonly LensCatalog[]> =
  T extends readonly [infer H, ...infer Rest]
    ? H extends LensCatalog
      ? Rest extends readonly LensCatalog[]
        ? IntersectTuple<[H, ...Rest]>
        : H
      : never
    : never;

export type DeepPick<K extends LensToken, T extends readonly LensCatalog[]> =
  K extends 'alpha'
    ? { readonly level: 1; readonly lenses: BuildIntersections<T> }
    : K extends 'bravo'
      ? { readonly level: 2; readonly lenses: BuildIntersections<T> }
      : K extends 'charlie'
        ? { readonly level: 3; readonly lenses: BuildIntersections<T> }
        : K extends 'delta'
          ? { readonly level: 4; readonly lenses: BuildIntersections<T> }
          : K extends 'echo'
            ? { readonly level: 5; readonly lenses: BuildIntersections<T> }
            : K extends 'foxtrot'
              ? { readonly level: 6; readonly lenses: BuildIntersections<T> }
              : K extends 'golf'
                ? { readonly level: 7; readonly lenses: BuildIntersections<T> }
                : K extends 'hotel'
                  ? { readonly level: 8; readonly lenses: BuildIntersections<T> }
                  : { readonly level: 99; readonly lenses: BuildIntersections<T> };

export type LensIntersectionFromTokens<T extends readonly LensToken[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? Head extends LensToken
      ? Tail extends readonly LensToken[]
        ? ResolveTokenLens<Head> & LensIntersectionFromTokens<Tail>
        : ResolveTokenLens<Head>
      : never
    : never;

type ResolveTokenLens<T extends LensToken> = T extends 'alpha'
  ? LensShapeA
  : T extends 'bravo'
    ? LensShapeB
    : T extends 'charlie'
      ? LensShapeC
      : T extends 'delta'
        ? LensShapeD
        : T extends 'echo'
          ? LensShapeE
          : T extends 'foxtrot'
            ? LensShapeF
            : T extends 'golf'
              ? LensShapeG
              : T extends 'hotel'
                ? LensShapeH
                : T extends 'india'
                  ? LensShapeI
                  : T extends 'juliet'
                    ? LensShapeJ
                    : T extends 'kilo'
                      ? LensShapeK
                      : T extends 'lima'
                        ? LensShapeL
                        : LensShapeA;

export type ReadonlyLensSet<T extends Readonly<Record<string, unknown>>> = {
  +readonly [K in keyof T]: T[K];
};

export type LensRecord = {
  readonly alpha: LensShapeA;
  readonly bravo: LensShapeB;
  readonly charlie: LensShapeC;
  readonly delta: LensShapeD;
  readonly echo: LensShapeE;
  readonly foxtrot: LensShapeF;
  readonly golf: LensShapeG;
  readonly hotel: LensShapeH;
  readonly india: LensShapeI;
  readonly juliet: LensShapeJ;
  readonly kilo: LensShapeK;
  readonly lima: LensShapeL;
};

export type ExpandedIntersection = {
  readonly scope: string;
  readonly metrics: {
    readonly [key: string]: unknown;
  };
  readonly tags: readonly string[];
};

export type LensInput<T extends object> =
  T & {
    [K in keyof T]-?: T[K] & { readonly __lens?: LensCatalog };
  };

export type FlattenIntersections<T extends readonly LensCatalog[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? Head extends object
      ? Tail extends LensCatalog[]
        ? ReadonlyLens<Head> & FlattenIntersections<Tail>
        : Head
      : never
    : {};

export const defaultLensShapes: readonly [
  LensShapeA,
  LensShapeB,
  LensShapeC,
  LensShapeD,
  LensShapeE,
  LensShapeF,
  LensShapeG,
  LensShapeH,
  LensShapeI,
  LensShapeJ,
  LensShapeK,
  LensShapeL,
] = [
  { scope: 'scopeA', metrics: { a: 1, b: 2 }, tags: ['a', 'b'] },
  { scope: 'scopeB', metrics: { c: 'c', d: 'd' }, tags: ['c', 'd'] },
  { scope: 'scopeC', metrics: { e: true, f: false }, tags: ['e', 'f'] },
  { scope: 'scopeD', metrics: { g: new Date(), h: new Date() }, tags: ['g', 'h'] },
  { scope: 'scopeE', metrics: { i: 'i', j: 2 }, tags: ['i', 'j'] },
  { scope: 'scopeF', metrics: { k: Symbol('k'), l: 'l' }, tags: ['k', 'l'] },
  { scope: 'scopeG', metrics: { m: 1n, n: 2n }, tags: ['m', 'n'] },
  { scope: 'scopeH', metrics: { o: null, p: undefined }, tags: ['o', 'p'] },
  { scope: 'scopeI', metrics: { q: /q/, r: new Error('lens') }, tags: ['q', 'r'] },
  { scope: 'scopeJ', metrics: { s: new Map([['a', 'b']]), t: new Set([1, 2]) }, tags: ['s', 't'] },
  { scope: 'scopeK', metrics: { u: new WeakMap<object, string>(), v: new WeakSet<object>() }, tags: ['u', 'v'] },
  { scope: 'scopeL', metrics: { w: Promise.resolve('w'), x: Promise.resolve(1) }, tags: ['w', 'x'] },
] as const;

export const scopeIntersections = {
  alpha: defaultLensShapes[0],
  bravo: defaultLensShapes[1],
  charlie: defaultLensShapes[2],
  delta: defaultLensShapes[3],
  echo: defaultLensShapes[4],
  foxtrot: defaultLensShapes[5],
  golf: defaultLensShapes[6],
  hotel: defaultLensShapes[7],
  india: defaultLensShapes[8],
  juliet: defaultLensShapes[9],
  kilo: defaultLensShapes[10],
  lima: defaultLensShapes[11],
};

export const mergeLensCatalog = <T extends readonly LensCatalog[]>(...items: T): FlattenIntersections<T> => {
  return Object.assign({}, ...items) as FlattenIntersections<T>;
};

export const summarizeIntersection = (lens: ExpandedIntersection): ReadonlyArray<string> => {
  const values = [
    lens.scope,
    ...lens.tags,
  ] as ReadonlyArray<string>;
  return values
    .map((entry, index) => `${String(index)}:${entry}`)
    .filter((entry) => entry.length > 0);
};
