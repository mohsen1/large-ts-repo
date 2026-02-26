export interface SegmentAlpha {
  readonly alphaRoute: `/alpha/${string}`;
  readonly alphaState: 'idle' | 'active';
}

export interface SegmentBeta {
  readonly betaRoute: `/beta/${string}`;
  readonly betaState: number;
}

export interface SegmentGamma {
  readonly gammaRoute: `/gamma/${string}`;
  readonly gammaState: { readonly enabled: boolean };
}

export type TriSegmentIntersection = SegmentAlpha & SegmentBeta & SegmentGamma;

export type SegmentEnvelope<TAlpha, TBeta, TGamma> = TAlpha & TBeta & TGamma;

export type SegmentCatalogInput = {
  readonly alpha: SegmentAlpha;
  readonly beta: SegmentBeta;
  readonly gamma: SegmentGamma;
};

export type SegmentToKey = {
  [K in keyof SegmentCatalogInput as `segment_${K & string}`]: SegmentCatalogInput[K];
};

export const mergeDisjointSegments = <
  TAlpha extends SegmentAlpha,
  TBeta extends SegmentBeta,
  TGamma extends SegmentGamma,
>(
  alpha: TAlpha,
  beta: TBeta,
  gamma: TGamma,
): SegmentEnvelope<TAlpha, TBeta, TGamma> => {
  return {
    ...alpha,
    ...beta,
    ...gamma,
  };
};

export const normalizeSegmentEnvelope = (
  payload: SegmentCatalogInput,
): SegmentToKey => ({
  segment_alpha: payload.alpha,
  segment_beta: payload.beta,
  segment_gamma: payload.gamma,
});

export type BuildGrid<T extends readonly string[]> =
  T extends readonly [infer Head extends string, ...infer Tail extends readonly string[]]
    ? Head extends keyof SegmentCatalogInput
      ? SegmentCatalogInput[Head] & BuildGrid<Tail>
      : never
    : {};

export type GridA = BuildGrid<readonly ['alpha', 'beta', 'gamma']>;

export type BuildDisjointUnion<TInput extends { readonly [k: string]: { key: string } }> = {
  [K in keyof TInput as `${K & string}_snapshot`]: TInput[K]['key'];
};

export interface GridRowA {
  readonly alpha_metric: number;
  readonly alpha_owner: string;
}

export interface GridRowB {
  readonly beta_metric: number;
  readonly beta_owner: string;
}

export interface GridRowC {
  readonly gamma_metric: number;
  readonly gamma_owner: string;
}

export type RowIntersection = GridRowA & GridRowB & GridRowC;

export interface SnapshotBundle {
  readonly tag: 'snapshot';
  readonly createdAt: string;
  readonly signature: string;
}

export type BundleIntersection = SnapshotBundle & RowIntersection;

export const hydrateBundle = <T extends SegmentCatalogInput>(input: T): BundleIntersection => {
  return {
    tag: 'snapshot',
    createdAt: new Date().toISOString(),
    signature: `${input.alpha.alphaRoute}:${input.beta.betaRoute}:${input.gamma.gammaRoute}`,
    alpha_metric: input.alpha.alphaState === 'active' ? 1 : 0,
    alpha_owner: input.alpha.alphaRoute,
    beta_metric: input.beta.betaState,
    beta_owner: input.beta.betaRoute,
    gamma_metric: input.gamma.gammaState.enabled ? 1 : 0,
    gamma_owner: input.gamma.gammaState.enabled ? 'true' : 'false',
  };
};
