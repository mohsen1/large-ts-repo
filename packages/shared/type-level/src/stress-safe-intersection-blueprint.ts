interface IntersectionAtomA {
  readonly blueprintA: string;
  readonly atomAId: `A-${number}`;
  readonly valueA: number;
}

interface IntersectionAtomB {
  readonly blueprintB: number;
  readonly atomBId: `B-${number}`;
  readonly valueB: boolean;
}

interface IntersectionAtomC {
  readonly blueprintC: boolean;
  readonly atomCId: `C-${number}`;
  readonly valueC: symbol;
}

interface IntersectionAtomD {
  readonly blueprintD: Date;
  readonly atomDId: `D-${number}`;
  readonly valueD: bigint;
}

interface IntersectionAtomE {
  readonly blueprintE: RegExp;
  readonly atomEId: `E-${number}`;
  readonly valueE: null;
}

interface IntersectionAtomF {
  readonly blueprintF: unknown[];
   readonly atomFId: `F-${number}`;
  readonly valueF: readonly string[];
}

interface IntersectionAtomG {
  readonly blueprintG: Record<string, string>;
  readonly atomGId: `G-${number}`;
  readonly valueG: { readonly status: 'ok' | 'warn' | 'fail' };
}

export type IntersectionBundleA = IntersectionAtomA;
export type IntersectionBundleB = IntersectionAtomB;
export type IntersectionBundleC = IntersectionAtomC;
export type IntersectionBundleD = IntersectionAtomD;
export type IntersectionBundleE = IntersectionAtomE;
export type IntersectionBundleF = IntersectionAtomF;
export type IntersectionBundleG = IntersectionAtomG;

export type IntersectionUnion =
  | IntersectionBundleA
  | IntersectionBundleB
  | IntersectionBundleC
  | IntersectionBundleD
  | IntersectionBundleE
  | IntersectionBundleF
  | IntersectionBundleG;

export type TripleUnionIntersection<T1 extends IntersectionUnion, T2 extends IntersectionUnion, T3 extends IntersectionUnion> =
  T1 & T2 & T3;

type EnsureDisjoint =
  | 'blueprintA'
  | 'blueprintB'
  | 'blueprintC'
  | 'blueprintD'
  | 'blueprintE'
  | 'blueprintF'
  | 'blueprintG'
  | 'atomAId'
  | 'atomBId'
  | 'atomCId'
  | 'atomDId'
  | 'atomEId'
  | 'atomFId'
  | 'atomGId'
  | 'valueA'
  | 'valueB'
  | 'valueC'
  | 'valueD'
  | 'valueE'
  | 'valueF'
  | 'valueG';

export type BlueprintSignature = Exclude<keyof (IntersectionBundleA & IntersectionBundleB & IntersectionBundleC), EnsureDisjoint>;

export type ComposeBlueprint<A extends IntersectionUnion, B extends IntersectionUnion, C extends IntersectionUnion> =
  A extends IntersectionAtomA
    ? B extends IntersectionAtomB
      ? C extends IntersectionAtomC
        ? A & B & C
        : never
      : never
    : A extends IntersectionAtomD
      ? B extends IntersectionAtomE
        ? C extends IntersectionAtomF
          ? A & B & C
          : never
        : never
      : A extends IntersectionAtomG
        ? B extends IntersectionAtomA
          ? C extends IntersectionAtomB
            ? A & B & C
            : never
          : never
        : never;

export type MapBlueprintTuple<T extends readonly IntersectionUnion[]> = {
  [K in keyof T]: T[K];
};

type RequireThree<T extends readonly IntersectionUnion[]> = T extends readonly [infer A, infer B, infer C, ...readonly any[]]
  ? A extends IntersectionUnion
    ? B extends IntersectionUnion
      ? C extends IntersectionUnion
        ? true
        : never
      : never
    : never
  : never;

export type AssembleBlueprint<T extends readonly IntersectionUnion[]> = RequireThree<T> extends true
  ? T extends readonly [infer A, infer B, infer C, ...infer Rest]
    ? Rest extends readonly []
      ? ComposeBlueprint<A & IntersectionUnion, B & IntersectionUnion, C & IntersectionUnion>
      : ComposeBlueprint<A & IntersectionUnion, B & IntersectionUnion, C & IntersectionUnion> &
          AssembleBlueprint<Extract<Rest, [IntersectionUnion, ...IntersectionUnion[]]>>
    : never
  : never;

type DisjointRecordInput = {
  readonly id: 'a' | 'b' | 'c';
  readonly label: string;
};

type IntersectedByKind<T extends DisjointRecordInput> = T extends { readonly id: 'a' }
  ? { readonly section: 'a'; readonly source: T }
  : T extends { readonly id: 'b' }
    ? { readonly section: 'b'; readonly source: T }
    : { readonly section: 'c'; readonly source: T };

export const disjointKeysA = {
  id: 'a' as const,
  label: 'alpha',
} satisfies DisjointRecordInput;

export const disjointKeysB = {
  id: 'b' as const,
  label: 'beta',
} satisfies DisjointRecordInput;

export const disjointKeysC = {
  id: 'c' as const,
  label: 'gamma',
} satisfies DisjointRecordInput;

export type AssembledBlueprintRecord = Record<string, IntersectedByKind<DisjointRecordInput>>;

export const composeIntersection = <
  A extends IntersectionBundleA,
  B extends IntersectionBundleB,
  C extends IntersectionBundleC,
>(first: A, second: B, third: C): TripleUnionIntersection<A, B, C> => {
  return { ...first, ...second, ...third } as TripleUnionIntersection<A, B, C>;
};

export const assembleIntersections = <
  A extends IntersectionBundleD,
  B extends IntersectionBundleE,
  C extends IntersectionBundleF,
  D extends IntersectionBundleG,
>(a: A, b: B, c: C, d: D): (A & B & C) | (A & B & D) | (A & C & D) | (B & C & D) => {
  const useFirst = true;
  return useFirst
    ? ({ ...a, ...b, ...c } as A & B & C)
    : ({ ...a, ...b, ...d } as A & B & D);
};

export const mapIntersections = <T extends Readonly<Record<string, DisjointRecordInput>>>(
  input: T,
): { readonly [K in keyof T & string]: IntersectedByKind<T[K]> } => {
  const out = {} as { [K in keyof T & string]: IntersectedByKind<T[K]> };
  for (const [key, item] of Object.entries(input) as Array<[keyof T & string, DisjointRecordInput]>) {
    out[key] = {
      section: item.id,
      source: item,
    } as IntersectedByKind<T[keyof T & string]>;
  }
  return out;
};

export const toDiscriminatedUnion = <
  T extends IntersectionBundleA | IntersectionBundleB | IntersectionBundleC | IntersectionBundleD,
>(input: readonly T[]): Array<{ readonly kind: 'A' | 'B' | 'C' | 'D'; readonly value: T }> => {
  const out: Array<{ kind: 'A' | 'B' | 'C' | 'D'; value: T }> = [];
  for (const value of input) {
    if ('atomAId' in value) {
      out.push({ kind: 'A', value });
    } else if ('atomBId' in value) {
      out.push({ kind: 'B', value });
    } else if ('atomCId' in value) {
      out.push({ kind: 'C', value });
    } else {
      out.push({ kind: 'D', value });
    }
  }
  return out;
};

export type BranchProjection = {
  readonly a: AssembledBlueprintRecord;
  readonly b: AssembledBlueprintRecord;
  readonly c: AssembledBlueprintRecord;
};
