export interface GridA {
  readonly a: number;
  readonly domain: 'a';
}
export interface GridB {
  readonly b: string;
  readonly domain: 'b';
}
export interface GridC {
  c?: boolean;
  readonly domain: 'c';
}
export interface GridD {
  readonly d: Date;
  readonly domain: 'd';
}
export interface GridE {
  readonly e: URL;
  readonly domain: 'e';
}
export interface GridF {
  readonly f: symbol;
  readonly domain: 'f';
}
export interface GridG {
  readonly g: bigint;
  readonly domain: 'g';
}
export interface GridH {
  readonly h: readonly string[];
  readonly domain: 'h';
}
export interface GridI {
  readonly i: Set<number>;
  readonly domain: 'i';
}
export interface GridJ {
  readonly j: Map<string, number>;
  readonly domain: 'j';
}
export interface GridK {
  readonly k: Record<string, unknown>;
  readonly domain: 'k';
}
export interface GridL {
  readonly l?: {
    readonly nested: string;
  };
  readonly domain: 'l';
}
export interface GridM {
  readonly m: { readonly mode: 'm' };
  readonly domain: 'm';
}
export interface GridN {
  readonly n: [string, string, string];
  readonly domain: 'n';
}
export interface GridO {
  readonly o: { readonly left: number; readonly right: number };
  readonly domain: 'o';
}
export interface GridP {
  readonly p: null;
  readonly domain: 'p';
}
export interface GridQ {
  readonly q: Promise<number>;
  readonly domain: 'q';
}
export interface GridR {
  readonly r: Promise<readonly string[]>;
  readonly domain: 'r';
}
export interface GridS {
  readonly s: { [key: string]: string };
  readonly domain: 's';
}
export interface GridT {
  readonly t: () => void;
  readonly domain: 't';
}
export interface GridU {
  readonly u: unknown;
  readonly domain: 'u';
}
export interface GridV {
  readonly v: Record<'x' | 'y', number>;
  readonly domain: 'v';
}
export interface GridW {
  readonly w: { w: true };
  readonly domain: 'w';
}
export interface GridX {
  readonly x: readonly [number, ...number[]];
  readonly domain: 'x';
}
export interface GridY {
  readonly y: { readonly y: { readonly z: number } };
  readonly domain: 'y';
}
export interface GridZ {
  readonly z: 'final';
  readonly domain: 'z';
}

export type LayerIntersection = GridA;

export type Normalize<T> = T extends (...args: any[]) => any
  ? never
  : T extends object
    ? { [K in keyof T]: T[K] }
    : T;

export type Overlap<A, B> = {
  [K in keyof (A & B)]: K extends keyof A
    ? K extends keyof B
      ? Normalize<A & B>[K]
      : A[K]
    : K extends keyof B
      ? B[K]
      : never;
};

export type MergeIntersections<T extends readonly object[]> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends object
    ? Tail extends readonly object[]
      ? Tail['length'] extends 0
        ? Normalize<Head>
        : Overlap<Head, MergeIntersections<Tail>>
      : never
    : never
  : {};

export type GridTuple = [
  GridA,
];

export type CollapsedGrid = GridA;

export type ExpandGridPayload = {
  [K in keyof GridTuple]: {
    readonly index: K;
    readonly payload: GridTuple[K] extends never ? never : GridTuple[K];
  };
};

export type DeepFieldMatrix<T> = T extends readonly unknown[]
  ? { [I in keyof T]: T[I] extends object ? DeepFieldMatrix<T[I]> : T[I] }
  : T extends object
    ? { [K in keyof T]: DeepFieldMatrix<T[K]> }
    : T;

type IntersectionFromRecords<T extends Record<string, object>> = MergeIntersections<{
  [K in keyof T]: T[K] extends object ? T[K] : {};
}[keyof T] extends infer R
  ? R extends readonly object[]
    ? R
    : readonly object[]
  : never>;

export type CollapsedFromMap<T extends Record<string, object>> =
  IntersectionFromRecords<T>;

export const mergeGridPieces = <T extends readonly object[]>(pieces: T): MergeIntersections<T> => {
  return Object.assign({}, ...pieces) as MergeIntersections<T>;
};

export const overlapGrid = (
  pieces: GridTuple,
): {
  readonly merged: CollapsedGrid;
  readonly map: DeepFieldMatrix<GridTuple>;
} => {
  const merged = mergeGridPieces(pieces);
  const map = pieces.map((piece, index) => ({ index, payload: piece })) as unknown as DeepFieldMatrix<GridTuple>;
  return { merged: merged as CollapsedGrid, map };
};

export const layeredIntersections = [
  [{ a: 1, domain: 'a' } as GridA],
  [{ b: 'x', domain: 'b' } as GridB],
  [{ c: true, domain: 'c' } as GridC],
  [{ d: new Date(), domain: 'd' } as GridD],
  [{ e: new URL('https://example.com/seed') , domain: 'e' } as GridE],
  [{ f: Symbol('f') , domain: 'f' } as GridF],
  [{ g: 22n, domain: 'g' } as GridG],
  [{ h: ['x', 'y', 'z'], domain: 'h' } as GridH],
] as const;

export const intersectionEnvelope = layeredIntersections.reduce<
  ReturnType<typeof mergeGridPieces>
>((acc, [next]) => ({ ...acc, ...(next as object) }), {} as ReturnType<typeof mergeGridPieces>);

export const buildMappedIntersection = <T extends Record<string, object>>(catalog: T): CollapsedFromMap<T> => {
  const entries = Object.entries(catalog).map((entry): Record<string, unknown> => ({ [entry[0]]: entry[1] }));
  return Object.assign({}, ...entries) as CollapsedFromMap<T>;
};

export type RoutedIntersectionById =
  | GridA
  | GridB
  | GridC
  | GridD;
