interface IntersectionTokenA {
  readonly tokenA: string;
}

interface IntersectionTokenB {
  readonly tokenB: number;
}

interface IntersectionTokenC {
  readonly tokenC: boolean;
}

interface IntersectionTokenD {
  readonly tokenD: Date;
}

interface IntersectionTokenE {
  readonly tokenE: readonly string[];
}

interface IntersectionTokenF {
  readonly tokenF: { readonly nested: string };
}

interface IntersectionTokenG {
  readonly tokenG: { readonly nested: number };
}

interface IntersectionTokenH {
  readonly tokenH: { readonly nested: boolean };
}

interface IntersectionTokenI {
  readonly tokenI: string;
}

export type DisjointTriple<A extends object, B extends object, C extends object> = A & B & C;

type ProjectionA = {
  [Key in keyof IntersectionTokenA as `${Key & string}A`]: IntersectionTokenA[Key];
};
type ProjectionB = {
  [Key in keyof IntersectionTokenB as `${Key & string}B`]: IntersectionTokenB[Key];
};
type ProjectionC = {
  [Key in keyof IntersectionTokenC as `${Key & string}C`]: IntersectionTokenC[Key];
};
type ProjectionD = {
  [Key in keyof IntersectionTokenD as `${Key & string}D`]: IntersectionTokenD[Key];
};
type ProjectionE = {
  [Key in keyof IntersectionTokenE as `${Key & string}E`]: IntersectionTokenE[Key];
};
type ProjectionF = {
  [Key in keyof IntersectionTokenF as `${Key & string}F`]: IntersectionTokenF[Key];
};
type ProjectionG = {
  [Key in keyof IntersectionTokenG as `${Key & string}G`]: IntersectionTokenG[Key];
};
type ProjectionH = {
  [Key in keyof IntersectionTokenH as `${Key & string}H`]: IntersectionTokenH[Key];
};
type ProjectionI = {
  [Key in keyof IntersectionTokenI as `${Key & string}I`]: IntersectionTokenI[Key];
};

export type IntersectionBundle = [
  DisjointTriple<ProjectionA, ProjectionB, ProjectionC>,
  DisjointTriple<ProjectionD, ProjectionE, ProjectionF>,
  DisjointTriple<ProjectionG, ProjectionH, ProjectionI>,
];

export type SegmentCount = IntersectionBundle['length'];

export const materializeIntersectionCatalog = <A extends object, B extends object, C extends object>(a: A, b: B, c: C) =>
  ({ ...a, ...b, ...c }) as A & B & C;

export type SafeIntersectionFactoryInput = [
  [Pick<IntersectionTokenA, 'tokenA'>, Pick<IntersectionTokenB, 'tokenB'>, Pick<IntersectionTokenC, 'tokenC'>],
  [Pick<IntersectionTokenD, 'tokenD'>, Pick<IntersectionTokenE, 'tokenE'>, Pick<IntersectionTokenF, 'tokenF'>],
  [Pick<IntersectionTokenG, 'tokenG'>, Pick<IntersectionTokenH, 'tokenH'>, Pick<IntersectionTokenI, 'tokenI'>],
];

const baseSegments: SafeIntersectionFactoryInput = [
  [{ tokenA: 'alpha' }, { tokenB: 1 }, { tokenC: true }],
  [{ tokenD: new Date('2026-01-01T00:00:00.000Z') }, { tokenE: ['seed'] }, { tokenF: { nested: 'seed' } }],
  [{ tokenG: { nested: 0 } }, { tokenH: { nested: true } }, { tokenI: 'terminal' }],
] as const;

export const assembleIntersectionCatalog = () => [
  [
    { tokenA: 'bravo', tokenB: 2, tokenC: false },
    { tokenD: new Date('2026-01-02T00:00:00.000Z'), tokenE: ['ring'], tokenF: { nested: 'pulse' } },
    { tokenG: { nested: 11 }, tokenH: { nested: false }, tokenI: 'signal' },
  ],
  [
    { tokenA: 'charlie', tokenB: 3, tokenC: true },
    { tokenD: new Date('2026-01-03T00:00:00.000Z'), tokenE: ['wave'], tokenF: { nested: 'trace' } },
    { tokenG: { nested: 22 }, tokenH: { nested: false }, tokenI: 'orbit' },
  ],
] as const;

export const intersectionCatalog = assembleIntersectionCatalog().map(([left, middle, right]) =>
  materializeIntersectionCatalog(left, middle, right),
);

export type IntersectionOutputMap = {
  readonly catalog: ReadonlyArray<
    DisjointTriple<IntersectionTokenA, IntersectionTokenD, IntersectionTokenG> |
      DisjointTriple<IntersectionTokenB, IntersectionTokenE, IntersectionTokenH> |
      DisjointTriple<IntersectionTokenC, IntersectionTokenF, IntersectionTokenI>
  >;
};

export const buildIntersectionBundle = (
  entries: SafeIntersectionFactoryInput,
): readonly [
  DisjointTriple<IntersectionTokenA, IntersectionTokenD, IntersectionTokenG>,
  DisjointTriple<IntersectionTokenD, IntersectionTokenE, IntersectionTokenF>,
  DisjointTriple<IntersectionTokenG, IntersectionTokenH, IntersectionTokenI>,
] => [
  materializeIntersectionCatalog(entries[0][0], baseSegments[1][0], baseSegments[2][0]),
  materializeIntersectionCatalog(entries[1][0], entries[1][1], entries[1][2]),
  materializeIntersectionCatalog(entries[2][0], entries[2][1], entries[2][2]),
] as const;

export const intersectionMatrix: ReadonlyArray<{
  readonly name: string;
  readonly segments: DisjointTriple<IntersectionTokenA, IntersectionTokenD, IntersectionTokenG>;
  readonly active: boolean;
}> = [
  {
    name: 'alpha',
    segments: materializeIntersectionCatalog(baseSegments[0][0], baseSegments[1][0], baseSegments[2][0]),
    active: true,
  },
  {
    name: 'bravo',
    segments: materializeIntersectionCatalog({ tokenA: 'bravo' }, { tokenD: baseSegments[1][0].tokenD }, { tokenG: baseSegments[2][0].tokenG }),
    active: false,
  },
  {
    name: 'charlie',
    segments: materializeIntersectionCatalog(
      { tokenA: 'charlie' },
      { tokenD: new Date('2026-01-03T00:00:00.000Z') },
      { tokenG: { nested: 33 } },
    ),
    active: true,
  },
] as const;
