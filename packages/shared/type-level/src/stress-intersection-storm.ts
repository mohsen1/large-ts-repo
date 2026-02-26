export interface StormAlpha {
  alpha: number;
  severity: 'low' | 'medium' | 'high';
}

export interface StormBeta {
  beta: string;
  scope: `scope-${string}`;
}

export interface StormGamma {
  gamma: boolean;
  flags: readonly string[];
}

export interface StormDelta {
  delta: readonly (string | number)[];
  checksum: `${string}:${number}`;
}

export interface StormEpsilon {
  epsilon: { readonly id: string; readonly weight: number };
  meta: { readonly tags: string[] };
}

export interface StormZeta {
  zeta: Record<string, number>;
  active: boolean;
}

export interface StormEta {
  eta: Array<{ readonly state: string; readonly rank: number }>;
}

export interface StormTheta {
  theta: Map<string, string>;
  window: { readonly start: number; readonly end: number };
}

export interface StormIota {
  iota: symbol;
  channel: `ch-${string}`;
}

export interface StormKappa {
  kappa: bigint;
  owner: { readonly id: string; readonly role: string };
}

export interface StormLambda {
  lambda: { readonly value: number; readonly unit: string };
  status: 'open' | 'closed' | 'draining';
}

export interface StormMu {
  mu: readonly [string, number][];
  checksum: number;
}

export interface StormNu {
  nu: Set<string>;
  index: number;
}

export interface StormXi {
  xi: `xi-${string}`;
  payload: readonly { key: string; value: unknown }[];
}

export interface StormOmicron {
  omicron: {
    readonly domain: string;
    readonly verb: string;
    readonly severity: string;
  };
  active: Readonly<Record<string, boolean>>;
}

export interface StormPi {
  pi: number;
  profile: { readonly profileId: string; readonly version: number };
}

export interface StormRho {
  rho: { readonly route: string; readonly score: number };
  vector: { readonly axis: string; readonly strength: number };
}

export interface StormSigma {
  sigma: readonly string[];
  history: readonly number[];
}

export interface StormTau {
  tau: { readonly now: string; readonly then: string };
  trace: Promise<string>;
}

export type StormIntersection =
  & StormAlpha
  & StormBeta
  & StormGamma
  & StormDelta
  & StormEpsilon
  & StormZeta
  & StormEta
  & StormTheta
  & StormIota
  & StormKappa
  & StormLambda
  & StormMu
  & StormNu
  & StormXi
  & StormOmicron
  & StormPi
  & StormRho
  & StormSigma
  & StormTau;

export type IntersectByIndex<
  T extends readonly object[],
  Acc = {}
> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends object
    ? IntersectByIndex<Extract<Tail, readonly object[]>, Acc & Head>
    : IntersectByIndex<Extract<Tail, readonly object[]>, Acc>
  : Acc;

export type IntersectionsFromTuples<
  T extends readonly object[],
  Fallback extends object = {}
> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends object
    ? IntersectionsFromTuples<
        Extract<Tail, readonly object[]>,
        Fallback & Head
      >
    : IntersectionsFromTuples<Extract<Tail, readonly object[]>, Fallback>
  : Fallback;

export type PickStorm<T extends StormIntersection, K extends keyof T> = Pick<T, K>;
export type OmitStorm<T extends StormIntersection, K extends keyof T> = Omit<T, K>;
export type RequireStorm<T extends StormIntersection> = Required<T>;
export type ReadonlyStorm<T extends StormIntersection> = Readonly<T>;

export type MergeShallow<A extends object, B extends object> = {
  [K in keyof (A & B)]: K extends keyof B ? B[K] : K extends keyof A ? A[K] : never;
};

export type StormProjection<T extends StormIntersection> = {
  [K in keyof T]: {
    readonly key: K;
    readonly value: T[K];
  };
};

export type StormOverlap<T extends StormIntersection> = {
  [K in keyof T]: Pick<T, K>;
};

export const resolveIntersection = (input: StormIntersection): StormIntersection => input;

export const mergeIntersectionChain = <T extends readonly object[]>(
  entries: readonly [...T],
): IntersectionsFromTuples<T, StormIntersection> => {
  const merged = entries.reduce<Record<string, unknown>>((acc, entry) => ({ ...acc, ...(entry as Record<string, unknown>) }), {});
  return merged as IntersectionsFromTuples<T, StormIntersection>;
};

export const pickIntersection = <T extends StormIntersection, K extends keyof T>(
  value: T,
  keys: readonly K[],
): PickStorm<T, K> => {
  const next = {} as PickStorm<T, K>;
  for (const key of keys) {
    (next as Record<string, unknown>)[key as string] = value[key];
  }
  return next;
};

export const omitIntersection = <T extends StormIntersection, K extends keyof T>(
  value: T,
  keys: readonly K[],
): OmitStorm<T, K> => {
  const copied = { ...value } as Record<string, unknown>;
  for (const key of keys) {
    delete copied[key as string];
  }
  return copied as OmitStorm<T, K>;
};

export type IntersectionsWithConstraint<
  T extends readonly StormIntersection[],
  K extends keyof StormIntersection
> = {
  readonly selected: {
    [index in keyof T]: Pick<T[index], K>;
  };
};

export const toProjectionRecord = <T extends StormIntersection>(value: T): StormProjection<T> => {
  const projected = {} as StormProjection<T>;
  for (const key of Object.keys(value) as Array<keyof T>) {
    projected[key] = { key, value: value[key] };
  }
  return projected;
};

export const stormCatalog = [
  'alpha',
  'beta',
  'gamma',
  'delta',
  'epsilon',
  'zeta',
  'eta',
  'theta',
  'iota',
  'kappa',
  'lambda',
  'mu',
  'nu',
  'xi',
  'omicron',
  'pi',
  'rho',
  'sigma',
  'tau',
] as const satisfies readonly (keyof StormIntersection)[];

export type StormRouteMatrix = IntersectByIndex<
  [
    StormAlpha,
    StormBeta,
    StormGamma,
    StormDelta,
    StormEpsilon,
    StormZeta,
    StormEta,
    StormTheta,
    StormIota,
    StormKappa,
    StormLambda,
    StormMu,
    StormNu,
    StormXi,
    StormOmicron,
    StormPi,
    StormRho,
    StormSigma,
    StormTau,
  ],
  {}
>;

export type StormEnvelope = {
  readonly intersection: StormIntersection;
  readonly routeKeys: typeof stormCatalog;
  readonly overlap: StormProjection<StormIntersection>;
};

export const buildStormEnvelope = (input: StormIntersection): StormEnvelope => {
  return {
    intersection: input,
    routeKeys: stormCatalog,
    overlap: toProjectionRecord(input),
  };
};

