import type { NoInferAdvanced, PairwiseJoin } from './composition-labs';

export type LatticeAxis =
  | 'audit'
  | 'autonomy'
  | 'availability'
  | 'behavior'
  | 'budget'
  | 'cadence'
  | 'capacity'
  | 'certification'
  | 'control'
  | 'correlation'
  | 'delivery'
  | 'drift'
  | 'edge'
  | 'event'
  | 'evolution'
  | 'expansion'
  | 'fidelity'
  | 'flow'
  | 'forecast'
  | 'goal'
  | 'health'
  | 'history'
  | 'identity'
  | 'impact'
  | 'integrity'
  | 'latency'
  | 'load'
  | 'maturity'
  | 'mesh'
  | 'metric'
  | 'orchestration'
  | 'parity'
  | 'policy'
  | 'portfolio'
  | 'posture'
  | 'provenance'
  | 'recovery'
  | 'reliability'
  | 'resilience'
  | 'risk'
  | 'route'
  | 'scenario'
  | 'score'
  | 'security';

export type LatticeBand =
  | 'alpha'
  | 'beta'
  | 'charlie'
  | 'delta'
  | 'epsilon'
  | 'zeta'
  | 'eta'
  | 'theta';

export type LatticeSegment<Name extends LatticeAxis, K extends LatticeBand> = {
  readonly axis: Name;
  readonly band: K;
  readonly version: number;
  readonly enabled: boolean;
  readonly metadata: { readonly owner: string; readonly updatedAt: number };
};

export type AxisA = LatticeSegment<'audit', 'alpha'>;
export type AxisB = LatticeSegment<'autonomy', 'alpha'>;
export type AxisC = LatticeSegment<'availability', 'beta'>;
export type AxisD = LatticeSegment<'behavior', 'beta'>;
export type AxisE = LatticeSegment<'budget', 'charlie'>;
export type AxisF = LatticeSegment<'cadence', 'charlie'>;
export type AxisG = LatticeSegment<'capacity', 'delta'>;
export type AxisH = LatticeSegment<'certification', 'delta'>;
export type AxisI = LatticeSegment<'control', 'epsilon'>;
export type AxisJ = LatticeSegment<'correlation', 'epsilon'>;
export type AxisK = LatticeSegment<'delivery', 'zeta'>;
export type AxisL = LatticeSegment<'drift', 'zeta'>;
export type AxisM = LatticeSegment<'edge', 'eta'>;
export type AxisN = LatticeSegment<'event', 'eta'>;
export type AxisO = LatticeSegment<'evolution', 'theta'>;
export type AxisP = LatticeSegment<'expansion', 'theta'>;
export type AxisQ = LatticeSegment<'fidelity', 'alpha'>;
export type AxisR = LatticeSegment<'flow', 'beta'>;
export type AxisS = LatticeSegment<'forecast', 'alpha'>;
export type AxisT = LatticeSegment<'goal', 'beta'>;
export type AxisU = LatticeSegment<'health', 'charlie'>;
export type AxisV = LatticeSegment<'history', 'delta'>;
export type AxisW = LatticeSegment<'identity', 'epsilon'>;
export type AxisX = LatticeSegment<'impact', 'zeta'>;
export type AxisY = LatticeSegment<'integrity', 'alpha'>;
export type AxisZ = LatticeSegment<'latency', 'alpha'>;
export type AxisAA = LatticeSegment<'load', 'beta'>;
export type AxisAB = LatticeSegment<'maturity', 'beta'>;
export type AxisAC = LatticeSegment<'mesh', 'beta'>;
export type AxisAD = LatticeSegment<'metric', 'beta'>;
export type AxisAE = LatticeSegment<'orchestration', 'beta'>;
export type AxisAF = LatticeSegment<'parity', 'alpha'>;
export type AxisAG = LatticeSegment<'policy', 'beta'>;
export type AxisAH = LatticeSegment<'portfolio', 'alpha'>;
export type AxisAI = LatticeSegment<'posture', 'beta'>;
export type AxisAJ = LatticeSegment<'provenance', 'alpha'>;
export type AxisAK = LatticeSegment<'recovery', 'delta'>;
export type AxisAL = LatticeSegment<'reliability', 'delta'>;
export type AxisAM = LatticeSegment<'resilience', 'delta'>;
export type AxisAN = LatticeSegment<'risk', 'delta'>;
export type AxisAO = LatticeSegment<'route', 'delta'>;
export type AxisAP = LatticeSegment<'scenario', 'delta'>;
export type AxisAQ = LatticeSegment<'score', 'epsilon'>;
export type AxisAR = LatticeSegment<'security', 'epsilon'>;

export type LatticeBody =
  | AxisA
  | AxisB
  | AxisC
  | AxisD
  | AxisE
  | AxisF;

export type LatticeGrid = LatticeBody[];

export type LatticeIntersection<TName extends string> = {
  readonly name: TName;
  readonly fingerprint: `lx:${TName}`;
} & {
  readonly axis: LatticeAxis;
  readonly band: LatticeBand;
  readonly version: number;
  readonly enabled: boolean;
  readonly metadata: { readonly owner: string; readonly updatedAt: number };
};

export type LatticeByAxis<T extends readonly LatticeAxis[]> = {
  [K in keyof T as K extends keyof T ? `axis:${K & number}` : never]: T[K] extends LatticeAxis ? LatticeSegment<T[K], 'alpha'> : never;
};

export type LatticeMap<T extends Record<string, LatticeBody>> = {
  readonly [K in keyof T]: T[K] extends LatticeBody ? (T[K] & { readonly profile: K }) : never;
};

export type LatticeFold<T extends readonly LatticeBody[], TAcc = unknown> = T extends readonly [infer Head, ...infer Tail]
  ? LatticeFold<Tail extends readonly LatticeBody[] ? Tail : never, NoInferAdvanced<TAcc & Head>>
  : TAcc;

export type LatticeSelector<T extends LatticeBody, AxisName extends LatticeAxis> = T extends { readonly axis: AxisName }
  ? T
  : never;

export type LatticeReconcile<T extends LatticeBody> = {
  [K in T['axis']]: {
    readonly band: T extends { readonly axis: K } ? T['band'] : never;
    readonly axis: K;
  };
};

export type LatticeRoute<T extends readonly LatticeBody[]> = {
  [I in keyof T]: T[I] extends infer R
    ? R extends LatticeBody
      ? `${R['axis']}.${R['band']}`
      : never
    : never;
};

export const pairwiseAxes = <const TLeft extends readonly string[], TRight extends readonly string[]>(left: TLeft, right: TRight): PairwiseJoin<TLeft, TRight> => {
  const out: string[] = [];
  const max = Math.max(left.length, right.length);
  for (let index = 0; index < max; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];
    if (leftValue !== undefined && rightValue !== undefined) {
      out.push(`${leftValue}|${rightValue}`);
    }
  }
  return out as PairwiseJoin<TLeft, TRight>;
};

export const buildLattice = <TName extends string>(name: TName): LatticeIntersection<TName> => {
  return {
    axis: 'audit',
    band: 'alpha',
    version: 1,
    enabled: true,
    metadata: { owner: name, updatedAt: Date.now() },
    name,
    fingerprint: `lx:${name}`,
  } as LatticeIntersection<TName>;
};

export type LatticeProjection<T extends LatticeBody> = {
  readonly key: `axis:${T['axis']}`;
  readonly band: T['band'];
  readonly profile: {
    readonly id: T['axis'];
    readonly revision: T['version'];
  };
};

export const latticeIndex: ReadonlyArray<{ readonly axis: LatticeAxis; readonly band: LatticeBand; readonly version: number; readonly enabled: boolean; readonly metadata: { readonly owner: string; readonly updatedAt: number } }> = [
  { axis: 'audit', band: 'alpha', version: 1, enabled: true, metadata: { owner: 'recovery', updatedAt: 1 } },
  { axis: 'autonomy', band: 'alpha', version: 2, enabled: false, metadata: { owner: 'drift', updatedAt: 2 } },
  { axis: 'availability', band: 'beta', version: 3, enabled: true, metadata: { owner: 'ops', updatedAt: 3 } },
  { axis: 'behavior', band: 'beta', version: 4, enabled: true, metadata: { owner: 'ops', updatedAt: 4 } },
  { axis: 'budget', band: 'charlie', version: 5, enabled: false, metadata: { owner: 'finance', updatedAt: 5 } },
  { axis: 'cadence', band: 'charlie', version: 6, enabled: true, metadata: { owner: 'ops', updatedAt: 6 } },
] as const;

export const normalizeLattice = <T extends LatticeBody>(entry: T): LatticeProjection<T> => {
  return {
    key: `axis:${entry.axis}` as const,
    band: entry.band,
    profile: {
      id: entry.axis,
      revision: entry.version,
    },
  } as LatticeProjection<T>;
};

export const foldLattice = (entries: ReadonlyArray<LatticeBody>): string[] => {
  const out: string[] = [];
  for (const entry of entries) {
    out.push(`${entry.axis}:${entry.band}:${entry.version}`);
  }
  return out;
};
