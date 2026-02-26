export interface IntersectionLayerA {
  readonly layer: 'A';
  readonly a: number;
  shared: string;
  mutable?: boolean;
}

export interface IntersectionLayerB {
  readonly layer: 'B';
  readonly b: number;
  readonly shared: string;
  a: number;
}

export interface IntersectionLayerC {
  readonly layer: 'C';
  readonly c: boolean;
  readonly shared: string;
}

export interface IntersectionLayerD {
  readonly layer: 'D';
  readonly d: string;
  readonly shared: string;
}

export interface IntersectionLayerE {
  readonly layer: 'E';
  readonly e: Date;
  readonly shared: string;
}

export interface IntersectionLayerF {
  readonly layer: 'F';
  readonly f: bigint;
  readonly shared: string;
}

export interface IntersectionLayerG {
  readonly layer: 'G';
  readonly g: { readonly nested: readonly string[] };
  readonly shared: string;
}

export interface IntersectionLayerH {
  readonly layer: 'H';
  readonly h: { readonly left: number; readonly right: number };
  readonly shared: string;
}

export interface IntersectionLayerI {
  readonly layer: 'I';
  readonly i: readonly [number, string, boolean];
  readonly shared: string;
}

export interface IntersectionLayerJ {
  readonly layer: 'J';
  readonly j: Map<string, number>;
  readonly shared: string;
}

export interface IntersectionLayerK {
  readonly layer: 'K';
  readonly k: Promise<string>;
  readonly shared: string;
}

export interface IntersectionLayerL {
  readonly layer: 'L';
  readonly l: Set<number>;
  readonly shared: string;
}

export interface IntersectionLayerM {
  readonly layer: 'M';
  readonly m: symbol;
  readonly shared: string;
}

export interface IntersectionLayerN {
  readonly layer: 'N';
  readonly n: RegExp;
  readonly shared: string;
}

export interface IntersectionLayerO {
  readonly layer: 'O';
  readonly o: Error;
  readonly shared: string;
}

export interface IntersectionLayerP {
  readonly layer: 'P';
  readonly p: ArrayBuffer;
  readonly shared: string;
}

export interface IntersectionLayerQ {
  readonly layer: 'Q';
  readonly q: ReadonlyMap<string, string>;
  readonly shared: string;
}

export interface IntersectionLayerR {
  readonly layer: 'R';
  readonly r: ReadonlySet<number>;
  readonly shared: string;
}

export interface IntersectionLayerS {
  readonly layer: 'S';
  readonly s: Intl.DateTimeFormat;
  readonly shared: string;
}

export interface IntersectionLayerT {
  readonly layer: 'T';
  readonly t: WeakMap<object, object>;
  readonly shared: string;
}

export interface IntersectionLayerU {
  readonly layer: 'U';
  readonly u: WeakSet<object>;
  readonly shared: string;
}

export interface IntersectionLayerV {
  readonly layer: 'V';
  readonly v: ReadonlyArray<boolean>;
  readonly shared: string;
}

export interface IntersectionLayerW {
  readonly layer: 'W';
  readonly w: { readonly value: number | string | boolean };
  readonly shared: string;
}

export interface IntersectionLayerX {
  readonly layer: 'X';
  readonly x: { readonly left: string; readonly right: string };
  readonly shared: string;
}

export interface IntersectionLayerY {
  readonly layer: 'Y';
  readonly y: { [key: string]: number };
  readonly shared: string;
}

export interface IntersectionLayerZ {
  readonly layer: 'Z';
  readonly z: { [key: number]: string };
  readonly shared: string;
}

export type WideIntersection =
  & IntersectionLayerA
  & IntersectionLayerB
  & IntersectionLayerC
  & IntersectionLayerD
  & IntersectionLayerE
  & IntersectionLayerF
  & IntersectionLayerG
  & IntersectionLayerH
  & IntersectionLayerI
  & IntersectionLayerJ
  & IntersectionLayerK
  & IntersectionLayerL
  & IntersectionLayerM
  & IntersectionLayerN
  & IntersectionLayerO
  & IntersectionLayerP
  & IntersectionLayerQ
  & IntersectionLayerR
  & IntersectionLayerS
  & IntersectionLayerT
  & IntersectionLayerU
  & IntersectionLayerV
  & IntersectionLayerW
  & IntersectionLayerX
  & IntersectionLayerY
  & IntersectionLayerZ;

export type IntersectMany<T extends readonly Record<string, unknown>[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? Head extends Record<string, unknown>
      ? Tail extends readonly Record<string, unknown>[]
        ? Head & IntersectMany<Tail>
        : Head
      : never
    : unknown;

export type IntersectFromUnion<T> = T extends Record<string, unknown> ? T : never;

export type KeyedIntersectionMap<T extends readonly string[]> = {
  [K in T[number]]: WideIntersection & { readonly key: K; readonly index: K };
};

export type ExtractIntersectionFields<T> = T extends { readonly layer: infer Layer }
  ? Layer
  : never;

export interface IntersectionEnvelope {
  readonly id: string;
  readonly layers: readonly string[];
  readonly catalog: WideIntersection;
}

export type IntersectionsForLayers<TLayers extends readonly (Record<string, unknown>)[]> = {
  [Index in keyof TLayers]: TLayers[Index] & WideIntersection;
};

export type FlattenIntersection<T> = T extends object
  ? { [K in keyof T]: T[K] extends object ? T[K] : T[K] }
  : T;

export const mergeIntersection = <T extends readonly Record<string, unknown>[]>(
  layers: T,
): IntersectMany<T> => {
  const result: Record<string, unknown> = {};
  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer)) {
      result[key] = value;
    }
  }
  return result as IntersectMany<T>;
};

export const buildIntersectionEnvelope = (layers: readonly string[]): IntersectionEnvelope => {
  const catalogLayers = [
    { layer: 'A', a: 1, shared: 'A', mutable: true },
    { layer: 'B', b: 2, shared: 'B', a: 3 },
    { layer: 'C', c: true, shared: 'C' },
    { layer: 'D', d: 'd', shared: 'D' },
    { layer: 'E', e: new Date(), shared: 'E' },
    { layer: 'F', f: 0n, shared: 'F' },
    { layer: 'G', g: { nested: ['x'] }, shared: 'G' },
    { layer: 'H', h: { left: 1, right: 2 }, shared: 'H' },
    { layer: 'I', i: [1, 'x', true], shared: 'I' },
    { layer: 'J', j: new Map(), shared: 'J' },
  ];

  return {
    id: layers.join('|'),
    layers,
    catalog: mergeIntersection(catalogLayers as unknown as readonly Record<string, unknown>[]) as unknown as WideIntersection,
  };
};
