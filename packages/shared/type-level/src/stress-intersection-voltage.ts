export interface NodeA {
  readonly kind: 'A';
  readonly name: `a-${string}`;
  readonly enabled: boolean;
}

export interface NodeB {
  readonly kind: 'B';
  readonly name: `b-${string}`;
  readonly enabled: boolean;
  readonly tags: readonly string[];
}

export interface NodeC {
  readonly kind: 'C';
  readonly route: `/route/${string}`;
  readonly retries: number;
}

export interface NodeD {
  readonly kind: 'D';
  readonly route: `/route/${string}`;
  readonly timeoutMs: number;
}

export interface NodeE {
  readonly kind: 'E';
  readonly payload: { readonly id: string; readonly score: number };
  readonly tags: readonly string[];
}

export interface NodeF {
  readonly kind: 'F';
  readonly payload: { readonly id: string; readonly score: number; readonly state: 'open' | 'closed' };
  readonly active: true;
}

export interface NodeG {
  readonly kind: 'G';
  readonly owner: { readonly team: string; readonly level: number };
  readonly tags: readonly string[];
}

export interface NodeH {
  readonly kind: 'H';
  readonly owner: { readonly team: string; readonly level: number; readonly zone: string };
  readonly enabled: boolean;
}

export interface NodeI {
  readonly kind: 'I';
  readonly meta: { readonly source: string; readonly confidence: number };
}

export interface NodeJ {
  readonly kind: 'J';
  readonly meta: { readonly source: string; readonly confidence: number; readonly tags: readonly string[] };
}

export interface NodeK {
  readonly kind: 'K';
  readonly policy: { readonly mode: 'strict' | 'lenient'; readonly windows: number };
}

export interface NodeL {
  readonly kind: 'L';
  readonly policy: { readonly mode: 'strict' | 'lenient'; readonly windows: number; readonly expiresAt: `${number}-${number}` };
}

export interface NodeM {
  readonly kind: 'M';
  readonly metrics: Record<string, number>;
}

export interface NodeN {
  readonly kind: 'N';
  readonly metrics: Record<string, number>;
  readonly scorecard: { readonly level: number; readonly tags: number };
}

export interface NodeO {
  readonly kind: 'O';
  readonly tags: readonly string[];
  readonly retries: number;
}

export interface NodeP {
  readonly kind: 'P';
  readonly tags: readonly string[];
  readonly retries: number;
  readonly queue: readonly string[];
}

export type IntersectionMap = NodeA & NodeB;

export type ChainA =
  & { readonly slot: 0; readonly enabled: false }
  & NodeC;

export type ChainB =
  & { readonly slot: 1; readonly enabled: true }
  & NodeD;

export type ChainC =
  & { readonly slot: 2; readonly enabled: true }
  & NodeE;

export type ChainD =
  & { readonly slot: 3; readonly enabled: false }
  & NodeF;

export type ChainE =
  & { readonly slot: 4; readonly enabled: boolean }
  & NodeG;

export type ChainF =
  & { readonly slot: 5; readonly enabled: boolean }
  & NodeH;

export type Aggregate = IntersectionMap & ChainA & ChainB;

export type Reconcile<T> = {
  [K in keyof T]: T[K] extends readonly unknown[] ? T[K][number][] : T[K];
};

export type ResolveTag<T> =
  T extends { tags: readonly (infer U)[] }
    ? U
    : T extends { payload: infer P }
      ? P extends { tags: readonly (infer V)[] }
        ? V
        : never
      : never;

export type CollapseIntersection<T> = Reconcile<{
  [K in keyof T]: K extends 'tags'
    ? ResolveTag<T>
    : K extends 'payload'
      ? T[K] & { resolvedBy: 'resolver' }
      : K extends 'owner'
        ? T[K] & { steward: 'system' }
        : T[K] extends object
          ? T[K]
          : T[K];
}>;

export interface IntersectedAggregate {
  readonly kind: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly tags: string[];
  readonly route: string;
  readonly retries: number;
  readonly timeoutMs: number;
  readonly payload: { readonly id: string; readonly score: number };
  readonly active: boolean;
  readonly owner: { readonly team: string; readonly level: number; readonly zone?: string };
  readonly meta: { readonly source: string; readonly confidence: number; readonly tags: readonly string[] };
  readonly policy: { readonly mode: string; readonly windows: number; readonly expiresAt: string };
  readonly metrics: Record<string, number>;
  readonly scorecard: { readonly level: number; readonly tags: number };
  readonly queue: string[];
  readonly slot: number;
  readonly [key: string]: unknown;
}

export type TransformIntersection<T, Prefix extends string> = {
  [K in keyof T as `${Prefix}.${K & string}`]:
    T[K] extends infer U
      ? U extends object
        ? { [P in keyof U]: U[P] }
        : U
      : never;
};

export type IntersectFold<T> =
  T extends readonly [infer Head, ...infer Tail]
    ? Tail extends readonly unknown[]
      ? Head & IntersectFold<Tail>
      : Head
    : {};

export type IntersectionsList = [
  NodeA,
  NodeB,
  NodeC,
  NodeD,
  NodeE,
  NodeF,
];

export type FoldedIntersection = NodeA & NodeC;

export type MappedIntersectionInput<T extends { readonly [key: string]: unknown }> = {
  [K in keyof T]: T[K];
} & {
  readonly __marker?: keyof T;
};

export const intersectionCatalog: ReadonlyArray<IntersectedAggregate> = [
  {
    kind: 'A',
    name: 'a-alpha',
    enabled: true,
    node: 'N0',
    weight: 0,
    stamp: '0',
    route: '/route/snapshot',
    retries: 8,
    timeoutMs: 120,
    payload: { id: 'payload-a', score: 91 },
    active: true,
    owner: { team: 'ops', level: 5, zone: 'us-east' },
    meta: { source: 'catalog', confidence: 0.99, tags: ['steady'] },
    policy: { mode: 'strict', windows: 3, expiresAt: '2026-03' },
    metrics: { pressure: 0.3, heat: 0.2 },
    scorecard: { level: 3, tags: 6 },
    tags: ['core'],
    queue: ['q1', 'q2'],
    slot: 0,
  },
  {
    kind: 'A',
    name: 'a-bravo',
    enabled: false,
    node: 'N1',
    weight: 1,
    stamp: '1',
    route: '/route/recover',
    retries: 5,
    timeoutMs: 240,
    payload: { id: 'payload-b', score: 44 },
    active: true,
    owner: { team: 'sre', level: 2, zone: 'eu-west' },
    meta: { source: 'runtime', confidence: 0.83, tags: ['fallback'] },
    policy: { mode: 'lenient', windows: 5, expiresAt: '2026-03' },
    metrics: { pressure: 0.7, heat: 0.6 },
    scorecard: { level: 1, tags: 3 },
    tags: ['incident', 'queue'],
    queue: ['q3'],
    slot: 1,
  },
] as const;

export const makeIntersection = <T extends Record<string, unknown>>(input: T): MappedIntersectionInput<T> => ({
  ...input,
});

export type IntersectionFunctionResult<T extends MappedIntersectionInput<Record<string, unknown>>> =
  Reconcile<{
    payload: T extends { readonly payload: infer P } ? P : never;
    route: T extends { route: infer R } ? R : never;
    severity: T extends { readonly severity: infer S } ? S : never;
  }>;

export const buildIntersection = <T extends Record<string, unknown>>(items: readonly T[]): readonly IntersectFold<T>[] => {
  return items.map(() => ({} as IntersectFold<T>[])[0]);
};

export const stampedIntersections: readonly TransformIntersection<Aggregate, 'node'>[] = [
  makeIntersection({ kind: 'A' }) as TransformIntersection<Aggregate, 'node'>,
  makeIntersection({ kind: 'B' }) as TransformIntersection<Aggregate, 'node'>,
] as const;

export const intersectionChain = buildIntersection(intersectionCatalog);
