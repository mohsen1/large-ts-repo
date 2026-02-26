export interface IdentityHeader {
  readonly headerId: string;
  readonly issuedAt: number;
}

export interface MetricsShard {
  readonly metricCount: number;
  readonly sampleWindow: number;
  readonly metricId: string;
}

export interface PolicyWindow {
  readonly policyMode: 'drift' | 'standard' | 'emergency';
  readonly policyVersion: `v-${number}`;
  readonly windowToken: string;
}

export interface OutcomeVector {
  readonly outcomeCode: number;
  readonly score: number;
  readonly confidence: number;
}

export interface RouteContext {
  readonly routeId: string;
  readonly namespace: string;
  readonly routeLabel: string;
}

export interface DispatchEnvelope {
  readonly dispatchKey: string;
  readonly dispatchMode: 'sync' | 'async';
  readonly deadlineMs: number;
}

export type TripleIntersection = IdentityHeader & MetricsShard & PolicyWindow;
export type QuadCandidate<T extends IdentityHeader, U extends MetricsShard, V extends PolicyWindow> = T & U & V;

export type DispatchMapProfile = TripleIntersection & {
  readonly profileVersion: 1;
};

export type DispatchMapContext = PolicyWindow & DispatchEnvelope & { readonly level: number };
export type IntersectedPayload<T extends string> = DispatchMapContext & {
  readonly kind: T;
  readonly marker: `${Uppercase<T>}_READY`;
  readonly route: RouteContext;
};

export type PairDisjoint<A, B> = A & B;
export type TripleDisjoint<A, B, C> = A & B & C;
export type RouteMapProfile = TripleDisjoint<IdentityHeader, MetricsShard, PolicyWindow>;

export interface PayloadCell {
  readonly key: string;
  readonly value: string | number | boolean;
}

export type MapDisjointInput<T extends Record<string, unknown>> = {
  [K in keyof T]: TripleDisjoint<
    IdentityHeader,
    MetricsShard,
    {
      readonly key: K;
      readonly value: T[K];
    }
  >;
}[keyof T];

export type ComposeDisjoint<T extends Record<string, unknown>> = TripleDisjoint<
  IdentityHeader,
  RouteContext,
  {
    readonly metrics: MetricsShard;
    readonly payloads: readonly MapDisjointInput<T>[];
    readonly cellCount: number;
  }
>;

export type BranchByMode<T extends 'sync' | 'async'> = T extends 'sync'
  ? TripleDisjoint<
      IdentityHeader,
      {
        readonly syncStamp: number;
        readonly routeLabel: `sync-${number}`;
      },
      PolicyWindow
    >
  : TripleDisjoint<
      IdentityHeader,
      {
        readonly asyncToken: string;
        readonly routeLabel: `async-${number}`;
      },
      PolicyWindow & DispatchEnvelope
    >;

export type SafeFold<T extends readonly Record<string, unknown>[], Acc = {
  readonly node: IdentityHeader;
  readonly metrics: MetricsShard;
}> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends Record<string, unknown>
    ? Tail extends readonly Record<string, unknown>[]
      ? SafeFold<Tail, PairDisjoint<Acc, Head>>
      : Acc
    : Acc
  : Acc;

export const isIdentityHeader = (value: unknown): value is IdentityHeader =>
  typeof value === 'object' && value !== null && 'headerId' in value && 'issuedAt' in value;

export const isRouteContext = (value: unknown): value is RouteContext =>
  typeof value === 'object' && value !== null && 'routeId' in value && 'namespace' in value;

export const makeHeader = (headerId: string): IdentityHeader => ({
  headerId,
  issuedAt: Date.now(),
});

export const makeMetrics = (): MetricsShard => ({
  metricCount: 0,
  sampleWindow: 0,
  metricId: crypto.randomUUID(),
});

export const makePolicyWindow = (mode: PolicyWindow['policyMode'] = 'standard'): PolicyWindow => ({
  policyMode: mode,
  policyVersion: 'v-1',
  windowToken: crypto.randomUUID(),
});

export const makeRouteContext = (routeId: string): RouteContext => ({
  routeId,
  namespace: 'recovery',
  routeLabel: `route-${routeId}`,
});

export const makeOutcomeVector = (code: number): OutcomeVector => ({
  outcomeCode: code,
  score: code / 100,
  confidence: 0.98,
});

export const makeIntersected = (): TripleIntersection => ({
  ...makeHeader('alpha'),
  ...makeMetrics(),
  ...makePolicyWindow('standard'),
});

export const makeDisjointProfile = <const K extends string, const V extends string>(key: K, value: V): ComposeDisjoint<{ [P in K]: V }> => {
  const header = makeHeader('beta');
  const route = makeRouteContext(value);
  const toCell = <RK extends string, RV extends string>(
    cellKey: RK,
    cellValue: RV,
  ): MapDisjointInput<{ [P in RK]: RV }> => ({
    ...header,
    ...makeMetrics(),
    key: cellKey,
    value: cellValue,
  }) as MapDisjointInput<{ [P in RK]: RV }>;
  return {
    ...header,
    ...route,
    metrics: makeMetrics(),
    payloads: [toCell(key, value)],
    cellCount: 1,
  };
};

export const createRouteMap = (rows: number): Array<RouteMapProfile> => {
  const out: Array<RouteMapProfile> = [];
  for (let i = 0; i < rows; i += 1) {
    out.push({
      ...makeHeader(`route-${i}`),
      ...makeMetrics(),
      ...makePolicyWindow('standard'),
    });
  }
  return out;
};

export const makeRouteMapContext = (index: number): RouteContext => ({
  routeId: `route-${index}`,
  namespace: `ns-${index % 3}`,
  routeLabel: `label-${index}`,
});

export type MapByPolicy<T extends PolicyWindow> = T extends { policyMode: 'emergency' }
  ? BranchByMode<'async'>
  : BranchByMode<'sync'>;

export function routeByPolicy<T extends PolicyWindow & { readonly policyMode: 'emergency' }>(policy: T): MapByPolicy<T>;
export function routeByPolicy<T extends PolicyWindow & { readonly policyMode: Exclude<PolicyWindow['policyMode'], 'emergency'> }>(
  policy: T,
): MapByPolicy<T>;
export function routeByPolicy(policy: PolicyWindow): BranchByMode<'sync'> | BranchByMode<'async'> {
  const marker = policy.policyVersion.replace(/[^0-9]/g, '') || `${Date.now()}`;
  const emergency: BranchByMode<'async'> = {
    headerId: policy.windowToken,
    issuedAt: Date.now(),
    asyncToken: policy.windowToken,
    routeLabel: `async-${marker}` as `async-${number}`,
    policyMode: 'emergency',
    policyVersion: policy.policyVersion,
    windowToken: policy.windowToken,
    dispatchKey: policy.windowToken,
    dispatchMode: 'async',
    deadlineMs: 20000,
  };
  const standard: BranchByMode<'sync'> = {
    headerId: policy.windowToken,
    issuedAt: Date.now(),
    syncStamp: Date.now(),
    routeLabel: `sync-${marker}` as `sync-${number}`,
    policyMode: policy.policyMode,
    policyVersion: policy.policyVersion,
    windowToken: policy.windowToken,
  };

  return policy.policyMode === 'emergency' ? emergency : standard;
}
