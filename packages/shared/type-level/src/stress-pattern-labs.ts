export type StressDomain =
  | 'identity'
  | 'continuity'
  | 'telemetry'
  | 'fabric'
  | 'signal'
  | 'policy'
  | 'workflow'
  | 'incident'
  | 'readiness'
  | 'cadence'
  | 'command'
  | 'simulation'
  | 'saga'
  | 'orchestration'
  | 'chronicle'
  | 'lattice'
  | 'quantum'
  | 'inventory'
  | 'audit'
  | 'compliance'
  | 'recovery'
  | 'mesh'
  | 'risk'
  | 'forecast'
  | 'drill'
  | 'ops'
  | 'intent'
  | 'fleet'
  | 'timeline'
  | 'fabric-sensor'
  | 'playbook';

export type StressAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'pause'
  | 'resume'
  | 'rollback'
  | 'escalate'
  | 'validate'
  | 'observe'
  | 'dispatch'
  | 'cancel'
  | 'ack'
  | 'commit'
  | 'review'
  | 'snapshot'
  | 'drain'
  | 'hydrate'
  | 'synchronize'
  | 'sweep'
  | 'reconcile';

export type StressPhase =
  | 'discovery'
  | 'plan'
  | 'prepare'
  | 'start'
  | 'execute'
  | 'assess'
  | 'repair'
  | 'verify'
  | 'stabilize'
  | 'archive';

export type StressVerb = `${StressAction}-${StressPhase}`;
export type StressResource = `${StressDomain}:${string}`;
export type StressRoute = `/${StressDomain}/${StressAction}/${string}`;

export type StressStatus = 'ok' | 'warn' | 'blocked' | 'fatal' | 'deferred';
export type StressPriority = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type Brand<T, Tag extends string> = T & { readonly __brand: Tag };

export type BrandedDomain<T extends StressDomain> = Brand<T, 'StressDomain'>;
export type BrandedVerb<T extends StressVerb> = Brand<T, 'StressVerb'>;
export type BrandedRoute<T extends StressRoute> = Brand<T, 'StressRoute'>;
export type BrandedPhase<T extends StressPhase> = Brand<T, 'StressPhase'>;

export interface StressEnvelope {
  readonly domain: BrandedDomain<StressDomain>;
  readonly verb: BrandedVerb<StressVerb>;
  readonly route: BrandedRoute<StressRoute>;
  readonly phase: BrandedPhase<StressPhase>;
  readonly priority: BrandedPriority;
  readonly status: StressStatus;
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
  readonly ts: string;
}

export type BrandedPriority = Brand<StressPriority, 'StressPriority'>;

export type DomainResolution<T> =
  T extends 'identity'
    ? { scope: 'identity'; tenant: string }
    : T extends 'continuity'
      ? { scope: 'continuity'; tenant: string; continuityWindow: number }
      : T extends 'telemetry'
        ? { scope: 'telemetry'; tenant: string; retentionDays: number }
        : T extends 'fabric'
          ? { scope: 'fabric'; tenant: string; shard: string }
          : T extends 'signal'
            ? { scope: 'signal'; tenant: string; signal: string }
            : T extends 'policy'
              ? { scope: 'policy'; policyId: string; owner: string }
              : T extends 'workflow'
                ? { scope: 'workflow'; tenant: string; workflowId: string }
                : T extends 'incident'
                  ? { scope: 'incident'; incidentId: string; severity: 'low' | 'medium' | 'high' }
                  : T extends 'readiness'
                    ? { scope: 'readiness'; tenant: string; readinessScore: number }
                    : T extends 'cadence'
                      ? { scope: 'cadence'; tenant: string; cadence: string }
                      : T extends 'command'
                        ? { scope: 'command'; commandId: string; operator: string }
                        : T extends 'simulation'
                          ? { scope: 'simulation'; tenant: string; scenarioId: string }
                          : T extends 'saga'
                            ? { scope: 'saga'; tenant: string; sagaId: string }
                            : T extends 'orchestration'
                              ? { scope: 'orchestration'; tenant: string; runtimeId: string }
                              : T extends 'chronicle'
                                ? { scope: 'chronicle'; tenant: string; historyDepth: number }
                                : T extends 'lattice'
                                  ? { scope: 'lattice'; latticeId: string; dimension: number }
                                  : T extends 'quantum'
                                    ? { scope: 'quantum'; tenant: string; coherence: number }
                                    : T extends 'inventory'
                                      ? { scope: 'inventory'; tenant: string; item: string }
                                      : T extends 'audit'
                                        ? { scope: 'audit'; tenant: string; actor: string }
                                        : T extends 'compliance'
                                          ? { scope: 'compliance'; tenant: string; region: string }
                                          : T extends 'recovery'
                                            ? { scope: 'recovery'; tenant: string; recoverabilityIndex: number }
                                            : T extends 'mesh'
                                              ? { scope: 'mesh'; tenant: string; nodeCount: number }
                                              : T extends 'risk'
                                                ? { scope: 'risk'; tenant: string; riskRating: 'low' | 'medium' | 'high' }
                                                : T extends 'forecast'
                                                  ? { scope: 'forecast'; tenant: string; horizon: number }
                                                  : T extends 'drill'
                                                    ? { scope: 'drill'; tenant: string; runBook: string }
                                                    : T extends 'ops'
                                                      ? { scope: 'ops'; tenant: string; operator: string }
                                                      : T extends 'intent'
                                                        ? { scope: 'intent'; tenant: string; intentId: string }
                                                        : T extends 'fleet'
                                                          ? { scope: 'fleet'; tenant: string; node: string }
                                                          : T extends 'timeline'
                                                            ? { scope: 'timeline'; tenant: string; checkpoint: string }
                                                            : T extends 'fabric-sensor'
                                                              ? { scope: 'fabric-sensor'; tenant: string; sensor: string }
                                                              : { scope: 'playbook'; tenant: string; playbookId: string };

export type ResolveDomain<T extends StressDomain> = DomainResolution<T>;
export type ResolveDomainDistributive<T extends StressDomain> = T extends any ? ResolveDomain<T> : never;

export type RouteFromTuple<T extends readonly [StressDomain, StressAction, `${string}`]> =
  T extends readonly [infer TDomain extends StressDomain, infer TAction extends StressAction, infer TSuffix extends string]
    ? BrandedRoute<`/${TDomain}/${TAction}/${TSuffix}`>
    : never;

export type RouteParse<T extends StressRoute> = T extends `/${infer TDomain}/${infer TAction}/${infer TSuffix}`
  ? TDomain extends StressDomain
    ? TAction extends StressAction
      ? { domain: TDomain; action: TAction; suffix: TSuffix; phase: StressPhase; envelope: RouteFromTuple<[TDomain, TAction, TSuffix]> }
      : never
    : never
  : never;

export type ChainedResolve<T extends StressRoute, Depth extends number = 6> =
  Depth extends 0
    ? T
    : T extends `${infer _Prefix}/${infer Rest}`
      ? ChainedResolve<`/${Rest}` & StressRoute, Depth extends number ? Depth : 6>
      : T;

export type ExtractRouteDomain<T extends StressRoute> = T extends `/${infer D}/${string}/${string}` ? (D & StressDomain) : never;

export type PhaseMatch<T extends StressVerb> =
  T extends `${string}-${'discovery' | 'plan' | 'prepare' | 'start'}` ? 'early'
    : T extends `${string}-${'execute' | 'assess'}` ? 'mid'
      : T extends `${string}-${'repair' | 'verify' | 'stabilize'}` ? 'late'
        : 'terminal';

export type RouteBundle<TInput extends ReadonlyArray<StressRoute>> = {
  [TIndex in keyof TInput as `bundle_${Extract<TIndex, string>}_${TInput[TIndex] & string}`]:
  RouteParse<TInput[TIndex] & StressRoute>;
};

export type DeepIntersect<
  T extends ReadonlyArray<unknown>,
  Acc = { readonly tags: readonly []; readonly priority: BrandedPriority; readonly status: StressStatus },
> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends Record<string, unknown>
    ? DeepIntersect<Tail, Acc & Head>
    : DeepIntersect<Tail, Acc>
  : Acc;

type PhaseBuckets = {
  early: readonly StressRoute[];
  mid: readonly StressRoute[];
  late: readonly StressRoute[];
  terminal: readonly StressRoute[];
};

type Bucketed<T extends readonly StressRoute[]> = {
  [K in keyof T]: T[K] extends StressRoute ? RouteParse<T[K]> : never;
};

export type RoutePhaseBuckets<TInput extends readonly StressRoute[]> = TInput extends readonly []
  ? { early: readonly []; mid: readonly []; late: readonly []; terminal: readonly [] }
  : {
      [K in keyof PhaseBuckets]: ReadonlyArray<Extract<RouteParse<TInput[number]>, { phase?: StressPhase }>>;
    };

export interface LabRouteEvent {
  readonly type: 'route';
  readonly path: StressRoute;
  readonly parsed: RouteParse<StressRoute>;
}

export interface LabMetricEvent {
  readonly type: 'metric';
  readonly metric: Brand<string, 'MetricName'>;
  readonly value: Brand<number, 'MetricValue'>;
  readonly weight: BrandedPriority;
}

export interface LabStateEvent {
  readonly type: 'state';
  readonly id: Brand<string, 'StateId'>;
  readonly state: BrandedPhase<StressPhase>;
}

export type StressEvent = LabRouteEvent | LabMetricEvent | LabStateEvent;

export type StressEventMap = {
  route: LabRouteEvent;
  metric: LabMetricEvent;
  state: LabStateEvent;
};

export type EventUnion<T extends keyof StressEventMap = keyof StressEventMap> = T extends keyof StressEventMap
  ? StressEventMap[T]
  : never;

export type EventPayload<T extends StressEvent> = T extends { type: 'route'; parsed: infer P }
  ? P & { readonly eventType: 'route' }
  : T extends { type: 'metric'; metric: infer M; value: infer V }
    ? { readonly metric: M; readonly value: V; readonly eventType: 'metric' }
    : T extends { type: 'state'; id: infer Id }
      ? { readonly id: Id; readonly eventType: 'state' }
      : never;

export type InferDomainFromEvents<T extends readonly StressEvent[]> = T extends readonly [infer THead, ...infer TTail]
  ? THead extends StressEvent
    ? THead extends { type: 'route'; parsed: { domain: infer D } }
      ? Exclude<D & StressDomain, undefined> | InferDomainFromEvents<Extract<TTail, readonly StressEvent[]>>
      : InferDomainFromEvents<Extract<TTail, readonly StressEvent[]>>
    : never
  : never;

export type EventAccumulator<TInput extends readonly StressEvent[], Acc = never> = TInput extends readonly [
  infer THead,
  ...infer TTail,
]
  ? THead extends StressEvent
    ? EventAccumulator<Extract<TTail, readonly StressEvent[]>, Acc | EventPayload<THead>>
    : EventAccumulator<Extract<TTail, readonly StressEvent[]>, Acc>
  : Acc;

export type PrefixTemplate<TPrefix extends string, TInput extends Record<string, string>> = {
  [K in keyof TInput as `${TPrefix}:${K & string}`]: TInput[K];
};

export type Pathify<T extends string> = T extends `${infer Head}/${infer Tail}` ? `path:${Head}` | Pathify<Tail> : `path:${T}`;

export const domainSeeds = [
  'identity',
  'continuity',
  'telemetry',
  'fabric',
  'signal',
  'policy',
  'workflow',
  'incident',
  'readiness',
  'cadence',
  'command',
  'simulation',
  'saga',
  'orchestration',
  'chronicle',
  'lattice',
  'quantum',
  'inventory',
  'audit',
  'compliance',
  'recovery',
  'mesh',
  'risk',
  'forecast',
  'drill',
  'ops',
  'intent',
  'fleet',
  'timeline',
  'fabric-sensor',
  'playbook',
] as const satisfies readonly StressDomain[];

export const actionSeeds = [
  'create',
  'update',
  'delete',
  'pause',
  'resume',
  'rollback',
  'escalate',
  'validate',
  'observe',
  'dispatch',
  'cancel',
  'ack',
  'commit',
  'review',
  'snapshot',
  'drain',
  'hydrate',
  'synchronize',
  'sweep',
  'reconcile',
] as const satisfies readonly StressAction[];

type RouteSeed = {
  readonly domain: StressDomain;
  readonly action: StressAction;
  readonly route: StressRoute;
};

const makeSeed = (domain: StressDomain, action: StressAction): RouteSeed => {
  const route = `/${domain}/${action}/${domain}-${action}-route` as string;
  return {
    domain,
    action,
    route: route as StressRoute,
  };
};

export const stressRouteSeeds: readonly RouteSeed[] = domainSeeds.flatMap((domain) => actionSeeds.map((action) => makeSeed(domain, action)));

export const routeBuckets: Readonly<{
  readonly early: readonly (typeof stressRouteSeeds)[number]['route'][];
  readonly mid: readonly (typeof stressRouteSeeds)[number]['route'][];
  readonly late: readonly (typeof stressRouteSeeds)[number]['route'][];
  readonly terminal: readonly (typeof stressRouteSeeds)[number]['route'][];
}> = {
  early: stressRouteSeeds.filter((entry) => entry.action === 'create' || entry.action === 'update' || entry.action === 'validate').map((entry) => entry.route),
  mid: stressRouteSeeds.filter((entry) => entry.action === 'dispatch' || entry.action === 'commit' || entry.action === 'pause').map((entry) => entry.route),
  late: stressRouteSeeds.filter((entry) => entry.action === 'resume' || entry.action === 'synchronize' || entry.action === 'rollback').map((entry) => entry.route),
  terminal: stressRouteSeeds.filter((entry) => entry.action === 'review' || entry.action === 'drain').map((entry) => entry.route),
};

export const parseRoute = <T extends StressRoute>(route: T): RouteParse<T> | null => {
  const match = /^\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(route);
  if (!match) {
    return null;
  }
  const [, domain, action, suffix] = match;
  if (!domainSeeds.includes(domain as StressDomain)) {
    return null;
  }
  if (!actionSeeds.includes(action as StressAction)) {
    return null;
  }
  const phase = (suffix.includes('prepare') || suffix.includes('discover')) ? 'prepare' : 'start';
  return {
    domain: domain as StressDomain,
    action: action as StressAction,
    suffix,
    phase,
    envelope: `/${domain}/${action}/${suffix}` as BrandedRoute<StressRoute>,
  } as RouteParse<T>;
};

export const makeEnrichedRoute = (
  domain: StressDomain,
  action: StressAction,
): BrandedRoute<StressRoute> => `/${domain}/${action}/${domain}.${action}` as BrandedRoute<StressRoute>;

export const routeChain = (start: StressRoute, depth = 12): ReadonlyArray<BrandedRoute<StressRoute>> => {
  const output: BrandedRoute<StressRoute>[] = [];
  let current = start;
  for (let index = 0; index < depth; index += 1) {
    output.push(current as BrandedRoute<StressRoute>);
    const parsed = parseRoute(current);
    if (!parsed) {
      break;
    }
    const nextDomain = domainSeeds[(index + 1) % domainSeeds.length] ?? 'identity';
    const nextAction = actionSeeds[(index + 2) % actionSeeds.length] ?? 'create';
    current = makeEnrichedRoute(nextDomain, nextAction);
  }
  return output;
};

export type ResolveChain<T extends readonly StressRoute[]> = {
  readonly routes: RouteBundle<T>;
  readonly flat: readonly [T[0], ...T, ...T];
  readonly domains: InferDomainFromEvents<{
    readonly type: 'route';
    readonly path: T[number];
    readonly parsed: RouteParse<T[number]>;
  } extends never
    ? []
    : readonly [{ readonly type: 'route'; readonly path: T[number]; readonly parsed: RouteParse<T[number]> }]>;
};
