export type IntersectionLayerA = {
  readonly axis: string;
  readonly region: string;
  readonly mode?: string;
  readonly weight: number;
};

export type IntersectionLayerB = {
  readonly axis: string;
  readonly region: string;
  readonly tags: readonly string[];
  readonly mode?: 'batch';
};

export type IntersectionLayerC = {
  readonly axis: string;
  readonly region: string;
  readonly retries: number;
  readonly weight: number;
};

export type IntersectionLayerD = {
  readonly axis: string;
  readonly schedule: readonly string[];
  readonly active: boolean;
  readonly timeoutMs: number;
};

export type IntersectionLayerE = {
  readonly axis: string;
  readonly region: string;
  readonly tags: readonly string[];
  readonly namespace: string;
};

export type IntersectionLayerF = {
  readonly axis: string;
  readonly active: boolean;
  readonly state: string;
};

export type IntersectionLayerG = {
  readonly axis: string;
  readonly trace: string;
  readonly attempts: number;
};

export type IntersectionLayerH = {
  readonly axis: string;
  readonly queue: readonly string[];
  readonly timeoutMs: number;
};

export type IntersectionLayerI = {
  readonly axis: string;
  readonly version: number;
};

export type IntersectionLayerJ = {
  readonly axis: string;
  readonly version: number;
  readonly namespace: string;
};

export type IntersectionLayerK = {
  readonly axis: string;
  readonly owner: string;
  readonly route: string;
  readonly mode?: string;
};

export type IntersectionLayerL = {
  readonly axis: string;
  readonly policy: `p-${number}`;
  readonly weight: number;
};

export type IntersectionLayerM = {
  readonly axis: string;
  readonly metadata: Record<string, unknown>;
  readonly state: string;
};

export type IntersectionLayerN = {
  readonly axis: string;
  readonly enabled: boolean;
  readonly depth: number;
};

export type IntersectionLayerO = {
  readonly axis: string;
  readonly signal: string;
  readonly timestamp: string;
};

export type IntersectionLayerP = {
  readonly axis: string;
  readonly priority: 0 | 1 | 2 | 3 | 4 | 5;
  readonly route: string;
};

export type IntersectionLayerQ = {
  readonly axis: string;
  readonly quorum: number;
  readonly weight: number;
};

export type IntersectionLayerR = {
  readonly axis: string;
  readonly route: string;
  readonly depth: number;
  readonly region: string;
};

export type IntersectionLayerS = {
  readonly axis: string;
  readonly signature: `sig-${string}`;
  readonly namespace: string;
};

export type IntersectionLayerT = {
  readonly axis: string;
  readonly tags: readonly [string, string, string];
};

export type IntersectionLayerU = {
  readonly axis: string;
  readonly unit: 'ms';
  readonly retries: number;
};

export type IntersectionLayerV = {
  readonly axis: string;
  readonly valid: boolean;
  readonly mode?: string;
};

export type IntersectionLayerW = {
  readonly axis: string;
  readonly weight: number;
  readonly window: `${number}-${number}`;
  readonly policy: string;
};

export type IntersectionLayerX = {
  readonly axis: string;
  readonly xid: string;
  readonly queue: readonly string[];
};

export type IntersectionLayerY = {
  readonly axis: string;
  readonly payload: unknown;
  readonly tags: readonly string[];
};

export type IntersectionLayerZ = {
  readonly axis: string;
  readonly zone: string;
  readonly state: string;
  readonly mode?: string;
};

export type RecoveryWideIntersection =
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

export type UnionToIntersection<T> = (T extends any ? (value: T) => void : never) extends (value: infer I) => void ? I : never;
export type FlattenIntersection<T> = { [K in keyof T]: T[K] };

export type MergeIntersection<T> = UnionToIntersection<
  {
    [K in keyof T]: { [P in K]: T[K] };
  }[keyof T]
>;

export type IntersectionAccumulator<T extends readonly object[], TAcc = unknown> =
  T extends readonly [infer Head, ...infer Tail]
    ? Head extends object
      ? Tail extends readonly object[]
        ? IntersectionAccumulator<Tail, MergeIntersection<[TAcc, Head]>>
        : MergeIntersection<[TAcc, Head]>
      : TAcc
    : TAcc;

export const buildIntersection = <T extends readonly object[], TAcc>(
  ...segments: T
): IntersectionAccumulator<T, TAcc> => {
  const out = segments.reduce<Record<string, unknown>>((acc, segment) => ({ ...acc, ...segment }), {});
  return out as IntersectionAccumulator<T, TAcc>;
};

export type SharedKeys<T extends object> = UnionToIntersection<
  {
    [K in keyof T]: { readonly [P in K]: T[K] };
  }[keyof T]
>;

export type ComposeIntersections<T extends readonly object[]> = {
  readonly flattened: MergeIntersection<T[number]>;
  readonly shared: SharedKeys<T[number]>;
  readonly merged: T extends readonly [] ? false : true;
};

export const assembleIntersectionMatrix = <const T extends readonly object[]>(
  matrix: T,
): ComposeIntersections<T> => {
  const out = matrix.reduce<Record<string, unknown>>((acc, row) => ({ ...acc, ...row }), {});
  return {
    flattened: out as MergeIntersection<T[number]>,
    shared: out as SharedKeys<T[number]>,
    merged: (matrix.length > 0) as T extends readonly [] ? false : true,
  };
};

export type ScopedIntersection<T extends object, K extends PropertyKey> = K extends keyof T ? T[K] : never;

export const reshape = <T extends Record<string, unknown>, K extends keyof T>(
  value: T,
  key: K,
): ScopedIntersection<T, K> => value[key] as ScopedIntersection<T, K>;

export const intersectionSummary = (value: RecoveryWideIntersection) => ({
  axisSignature: [
    value.axis,
    value.region,
    value.mode ?? value.state ?? value.active ?? value['axis'],
  ]
    .filter((segment): segment is string => typeof segment === 'string')
    .join('|'),
  weight: value.weight ?? value['retries'] ?? 0,
  mode: value.mode ?? 'derive',
  valid: value.active ?? true,
});

export const intersectionCatalog = assembleIntersectionMatrix([
  { axis: 'A', region: 'us-east-1', mode: 'read', weight: 1 },
  { axis: 'B', region: 'eu-west', tags: ['primary'], weight: 2 },
  { axis: 'C', region: 'apac', retries: 3, weight: 5 },
  { axis: 'D', schedule: ['warmup', 'scale'], active: true, timeoutMs: 300 },
  { axis: 'E', region: 'us-west', tags: ['primary', 'critical'], namespace: 'main' },
  { axis: 'F', active: true, state: 'running' },
  { axis: 'G', trace: 't-1', attempts: 4 },
  { axis: 'H', queue: ['q1', 'q2'], timeoutMs: 500 },
  { axis: 'I', version: 1 },
  { axis: 'J', version: 3, namespace: 'main' },
  { axis: 'K', owner: 'ops', route: '/orchestrate/recover', mode: 'critical' },
  { axis: 'L', policy: 'p-77', weight: 11 },
  { axis: 'M', metadata: { tier: 'critical' }, state: 'active' },
  { axis: 'N', enabled: true, depth: 4 },
  { axis: 'O', signal: 'go', timestamp: '2026-01-01T00:00:00Z' },
  { axis: 'P', priority: 4, route: '/dispatch' },
  { axis: 'Q', quorum: 3, weight: 6 },
  { axis: 'R', route: '/orchestrate/recover', depth: 5, region: 'us-central' },
  { axis: 'S', signature: 'sig-alpha', namespace: 'ops' },
  { axis: 'T', tags: ['a', 'b', 'c'] },
  { axis: 'U', unit: 'ms', retries: 1 },
  { axis: 'V', valid: true, mode: 'observed' },
  { axis: 'W', weight: 13, window: '1-3', policy: 'adaptive' },
  { axis: 'X', xid: 'x-id', queue: ['ingest', 'drain'] },
  { axis: 'Y', payload: { version: 1 }, tags: ['history'] },
  { axis: 'Z', zone: 'us', state: 'ok' },
] as const) as unknown as RecoveryWideIntersection;

export const intersectionCatalogEntries = {
  section: [
    intersectionCatalog.axis,
    intersectionCatalog.state ?? 'derived',
    intersectionCatalog.mode ?? 'derived',
  ],
  valid: intersectionSummary(intersectionCatalog),
  payload: reshape(intersectionCatalog, 'tags'),
} as const;
