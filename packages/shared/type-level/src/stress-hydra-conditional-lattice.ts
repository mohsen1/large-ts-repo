export type HydraVerb =
  | 'bootstrap'
  | 'ingest'
  | 'materialize'
  | 'validate'
  | 'reconcile'
  | 'synthesize'
  | 'snapshot'
  | 'restore'
  | 'simulate'
  | 'inject'
  | 'amplify'
  | 'throttle'
  | 'rebalance'
  | 'reroute'
  | 'contain'
  | 'recover'
  | 'observe'
  | 'drill'
  | 'audit'
  | 'telemetry'
  | 'dispatch'
  | 'stabilize'
  | 'floodfill'
  | 'isolate'
  | 'mesh-check'
  | 'policy-rewrite'
  | 'signal-triage'
  | 'workload-balance'
  | 'safety-guard'
  | 'latency-loop'
  | 'node-recover'
  | 'route-fallback'
  | 'topology-drift'
  | 'signal-reconcile'
  | 'policy-enforce'
  | 'load-shed'
  | 'resource-scan'
  | 'state-rollback'
  | 'policy-override'
  | 'mesh-evict'
  | 'workload-shape'
  | 'incident-close'
  | 'heal'
  | 'signal-stabilize'
  | 'timeline-drift'
  | 'resource-heal'
  | 'compliance-audit'
  | 'policy-reinforce'
  | 'policy-audit'
  | 'risk-trace'
  | 'rollback';

export type HydraDomain =
  | 'atlas'
  | 'drill'
  | 'risk'
  | 'timeline'
  | 'mesh'
  | 'quantum'
  | 'policy'
  | 'incident'
  | 'workflow'
  | 'signal'
  | 'ops'
  | 'store'
  | 'playbook'
  | 'container'
  | 'gateway'
  | 'observer'
  | 'catalog'
  | 'orchestrator'
  | 'recovery'
  | 'network'
  | 'cluster'
  | 'identity'
  | 'agent'
  | 'queue'
  | 'planner'
  | 'registry'
  | 'telemetry'
  | 'analytics'
  | 'governance'
  | 'resilience'
  | 'fabric';

export type HydraScope =
  | 'seed'
  | 'run'
  | 'loop'
  | 'plan'
  | 'trace'
  | 'closure'
  | 'restore'
  | 'observe'
  | 'fallback'
  | 'evict'
  | 'heal'
  | 'audit'
  | 'stabilize'
  | 'dispatch'
  | 'review'
  | 'zone'
  | 'drain'
  | 'rollback'
  | 'alert'
  | 'signal'
  | 'terminal'
  | 'front'
  | 'back'
  | 'quarantine';

export type HydraSegment = `id-${number}` | `urn-${string}` | 'latest';
export type HydraRoute = `${string & {}}/${string & {}}/${string & {}}/${HydraSegment}`;
export type HydraNumericSegment = `id-${number}` | `urn-${number}`;

export type BuildHydraTuple<Length extends number, Acc extends readonly unknown[] = []> =
  Acc['length'] extends Length ? Acc : BuildHydraTuple<Length, [...Acc, Acc['length']]>;

export type Decrement<N extends number> = BuildHydraTuple<N> extends readonly [infer _, ...infer Tail] ? Tail['length'] : 0;

export type HydraSeverityFromScope<T extends HydraScope> =
  T extends 'seed' | 'run' | 'trace'
    ? 'low'
    : T extends 'plan' | 'closure' | 'audit' | 'review'
      ? 'medium'
      : T extends 'heal' | 'rollback' | 'stabilize'
        ? 'high'
        : T extends 'terminal' | 'drain' | 'zone'
          ? 'critical'
          : 'emergency';

export type HydraSeverity = HydraSeverityFromScope<HydraScope>;

export type HydraScore<S extends HydraSeverity> =
  S extends 'low' ? 10 : S extends 'medium' ? 25 : S extends 'high' ? 50 : S extends 'critical' ? 80 : 100;

type VerbStage<T extends HydraVerb> = T extends
  | 'bootstrap'
  | 'ingest'
  | 'materialize'
  ? 'entry'
  : T extends 'validate' | 'reconcile' | 'synthesize'
    ? 'analysis'
    : T extends 'snapshot' | 'restore' | 'simulate' | 'inject'
      ? 'repair'
      : T extends 'amplify' | 'throttle' | 'rebalance'
        ? 'stabilize'
        : T extends 'reroute' | 'contain'
          ? 'containment'
          : T extends 'observe' | 'drill' | 'audit'
            ? 'assurance'
            : T extends 'telemetry' | 'dispatch'
              ? 'notify'
              : T extends 'isolate' | 'floodfill' | 'policy-rewrite'
                ? 'hardening'
                : T extends 'signal-triage' | 'workload-balance'
                  ? 'triage'
                  : T extends 'policy-override' | 'mesh-evict'
                    ? 'override'
                    : T extends 'workload-shape' | 'incident-close' | 'signal-stabilize'
                      ? 'heal'
                      : T extends 'resource-scan' | 'state-rollback' | 'timeline-drift'
                        ? 'inspection'
                        : T extends 'route-fallback' | 'topology-drift' | 'signal-reconcile'
                          ? 'route'
                          : T extends 'policy-enforce' | 'load-shed' | 'mesh-check'
                            ? 'govern'
                            : T extends 'resource-heal' | 'safety-guard' | 'latency-loop' | 'node-recover'
                              ? 'reconcile'
                              : T extends 'compliance-audit' | 'policy-reinforce'
                                ? 'audit'
                                : 'execute';

type DomainProfile<TDomain extends HydraDomain> =
  TDomain extends 'atlas'
    ? { readonly scope: 'catalog'; readonly tier: 1; readonly criticality: 'low' }
    : TDomain extends 'drill'
      ? { readonly scope: 'resilience'; readonly tier: 2; readonly criticality: 'critical' }
      : TDomain extends 'risk'
        ? { readonly scope: 'hazard'; readonly tier: 3; readonly criticality: 'critical' }
        : TDomain extends 'timeline'
          ? { readonly scope: 'chronology'; readonly tier: 4; readonly criticality: 'medium' }
          : TDomain extends 'mesh'
            ? { readonly scope: 'topology'; readonly tier: 5; readonly criticality: 'high' }
            : TDomain extends 'quantum'
              ? { readonly scope: 'simulation'; readonly tier: 6; readonly criticality: 'critical' }
              : TDomain extends 'policy'
                ? { readonly scope: 'governance'; readonly tier: 7; readonly criticality: 'high' }
                : TDomain extends 'incident'
                  ? { readonly scope: 'response'; readonly tier: 8; readonly criticality: 'critical' }
                  : TDomain extends 'workflow'
                    ? { readonly scope: 'execution'; readonly tier: 9; readonly criticality: 'medium' }
                    : TDomain extends 'signal'
                      ? { readonly scope: 'telemetry'; readonly tier: 10; readonly criticality: 'low' }
                      : TDomain extends 'ops'
                        ? { readonly scope: 'actuation'; readonly tier: 11; readonly criticality: 'high' }
                        : TDomain extends 'store'
                          ? { readonly scope: 'persist'; readonly tier: 12; readonly criticality: 'medium' }
                          : TDomain extends 'playbook'
                            ? { readonly scope: 'automation'; readonly tier: 13; readonly criticality: 'medium' }
                            : TDomain extends 'container'
                              ? { readonly scope: 'isolation'; readonly tier: 14; readonly criticality: 'high' }
                              : TDomain extends 'gateway'
                                ? { readonly scope: 'edge'; readonly tier: 15; readonly criticality: 'medium' }
                                : TDomain extends 'observer'
                                  ? { readonly scope: 'monitoring'; readonly tier: 16; readonly criticality: 'low' }
                                  : TDomain extends 'catalog'
                                    ? { readonly scope: 'registry'; readonly tier: 17; readonly criticality: 'low' }
                                    : TDomain extends 'orchestrator'
                                      ? { readonly scope: 'coordination'; readonly tier: 18; readonly criticality: 'critical' }
                                      : TDomain extends 'recovery'
                                        ? { readonly scope: 'resurgence'; readonly tier: 19; readonly criticality: 'high' }
                                        : TDomain extends 'network'
                                          ? { readonly scope: 'fabric'; readonly tier: 20; readonly criticality: 'high' }
                                          : TDomain extends 'cluster'
                                            ? { readonly scope: 'fleet'; readonly tier: 21; readonly criticality: 'medium' }
                                            : TDomain extends 'identity'
                                              ? { readonly scope: 'access'; readonly tier: 22; readonly criticality: 'medium' }
                                              : TDomain extends 'agent'
                                                ? { readonly scope: 'automation'; readonly tier: 23; readonly criticality: 'medium' }
                                                : TDomain extends 'queue'
                                                  ? { readonly scope: 'dispatch'; readonly tier: 24; readonly criticality: 'low' }
                                                  : TDomain extends 'planner'
                                                    ? { readonly scope: 'forecast'; readonly tier: 25; readonly criticality: 'medium' }
                                                    : TDomain extends 'registry'
                                                      ? { readonly scope: 'index'; readonly tier: 26; readonly criticality: 'low' }
                                                      : TDomain extends 'telemetry'
                                                        ? { readonly scope: 'observability'; readonly tier: 27; readonly criticality: 'low' }
                                                        : TDomain extends 'analytics'
                                                          ? { readonly scope: 'insight'; readonly tier: 28; readonly criticality: 'medium' }
                                                          : TDomain extends 'governance'
                                                            ? { readonly scope: 'oversight'; readonly tier: 29; readonly criticality: 'high' }
                                                            : TDomain extends 'resilience'
                                                              ? { readonly scope: 'survival'; readonly tier: 30; readonly criticality: 'critical' }
                                                              : TDomain extends 'fabric'
                                                                ? { readonly scope: 'construction'; readonly tier: 31; readonly criticality: 'medium' }
                                                                : { readonly scope: 'unknown'; readonly tier: 999; readonly criticality: 'low' };

type ActionProfile<TVerb extends HydraVerb> =
  TVerb extends 'bootstrap' | 'ingest' | 'materialize'
    ? { readonly phase: 'start'; readonly weight: 1; readonly requires: ['core'] }
    : TVerb extends 'validate' | 'reconcile' | 'synthesize'
      ? { readonly phase: 'analysis'; readonly weight: 4; readonly requires: ['domain', 'policy'] }
      : TVerb extends 'snapshot' | 'restore' | 'simulate' | 'inject'
        ? { readonly phase: 'repair'; readonly weight: 6; readonly requires: ['catalog', 'telemetry'] }
        : TVerb extends 'amplify' | 'throttle' | 'rebalance'
          ? { readonly phase: 'stabilize'; readonly weight: 7; readonly requires: ['control', 'workload'] }
          : TVerb extends 'reroute' | 'contain' | 'recover'
            ? { readonly phase: 'containment'; readonly weight: 9; readonly requires: ['mesh', 'signal'] }
            : TVerb extends 'observe' | 'drill' | 'audit'
              ? { readonly phase: 'assure'; readonly weight: 3; readonly requires: ['observer', 'trace'] }
              : TVerb extends 'telemetry' | 'dispatch'
                ? { readonly phase: 'notify'; readonly weight: 2; readonly requires: ['bus', 'queue'] }
                : TVerb extends 'isolate' | 'floodfill' | 'policy-rewrite'
                  ? { readonly phase: 'hardening'; readonly weight: 8; readonly requires: ['policy', 'scope'] }
                  : TVerb extends 'policy-override' | 'mesh-evict' | 'compliance-audit'
                    ? { readonly phase: 'override'; readonly weight: 10; readonly requires: ['audit', 'control'] }
                    : TVerb extends 'workload-shape' | 'incident-close' | 'signal-stabilize'
                      ? { readonly phase: 'heal'; readonly weight: 6; readonly requires: ['planner', 'runtime'] }
                      : TVerb extends 'resource-scan' | 'state-rollback' | 'timeline-drift'
                        ? { readonly phase: 'inspection'; readonly weight: 5; readonly requires: ['snapshot', 'record'] }
                        : TVerb extends 'route-fallback' | 'topology-drift' | 'signal-reconcile'
                          ? { readonly phase: 'route'; readonly weight: 4; readonly requires: ['topology', 'route'] }
                          : TVerb extends 'policy-enforce' | 'load-shed' | 'mesh-check'
                            ? { readonly phase: 'govern'; readonly weight: 7; readonly requires: ['governance', 'metrics'] }
                            : TVerb extends 'resource-heal' | 'safety-guard' | 'latency-loop' | 'node-recover'
                              ? { readonly phase: 'reconcile'; readonly weight: 8; readonly requires: ['resource', 'latency'] }
                              : TVerb extends 'policy-reinforce'
                                ? { readonly phase: 'harden'; readonly weight: 11; readonly requires: ['policy', 'registry'] }
                                : { readonly phase: 'execute'; readonly weight: 1; readonly requires: [] };

const nextVerbMatrix = {
  'bootstrap': ['ingest'],
  'ingest': ['materialize', 'validate'],
  'materialize': ['validate', 'reconcile'],
  'validate': ['reconcile', 'synthesize'],
  'reconcile': ['snapshot', 'restore'],
  'synthesize': ['snapshot', 'simulate'],
  'snapshot': ['restore', 'simulate'],
  'restore': ['bootstrap', 'simulate'],
  'simulate': ['validate', 'recover'],
  'inject': ['synthesize', 'validate'],
  'amplify': ['stabilize', 'throttle'],
  'throttle': ['rebalance', 'latency-loop'],
  'rebalance': ['route-fallback', 'dispatch'],
  'reroute': ['mesh-check', 'policy-override'],
  'contain': ['heal'],
  'recover': ['audit'],
  'observe': ['drill'],
  'drill': ['workload-balance', 'policy-audit'],
  'audit': ['snapshot', 'telemetry'],
  'telemetry': ['dispatch', 'observe'],
  'dispatch': ['route-fallback', 'contain'],
  'stabilize': ['isolate', 'floodfill'],
  'floodfill': ['resource-scan', 'signal-stabilize'],
  'isolate': ['heal'],
  'mesh-check': ['topology-drift', 'mesh-evict'],
  'policy-rewrite': ['policy-enforce', 'policy-override'],
  'signal-triage': ['signal-reconcile', 'signal-stabilize'],
  'workload-balance': ['resource-heal', 'workload-shape'],
  'safety-guard': ['topology-drift', 'state-rollback'],
  'latency-loop': ['throttle', 'load-shed'],
  'node-recover': ['recover', 'stabilize'],
  'route-fallback': ['bootstrap', 'dispatch'],
  'topology-drift': ['mesh-check', 'signal-reconcile'],
  'signal-reconcile': ['telemetry', 'signal-stabilize'],
  'policy-enforce': ['policy-rewrite', 'policy-override'],
  'load-shed': ['resource-heal', 'stabilize'],
  'resource-scan': ['audit', 'risk-trace'],
  'state-rollback': ['restore', 'rollback'],
  'policy-override': ['policy-rewrite', 'policy-reinforce'],
  'mesh-evict': ['mesh-check', 'isolate'],
  'workload-shape': ['load-shed', 'simulate'],
  'incident-close': ['route-fallback', 'audit'],
  'signal-stabilize': ['recover', 'stabilize'],
  'timeline-drift': ['snapshot', 'restore'],
  'resource-heal': ['heal', 'observe'],
  'compliance-audit': ['policy-enforce', 'audit'],
  'policy-reinforce': ['policy-audit', 'policy-enforce'],
} as const;

type NextVerbMatrix = typeof nextVerbMatrix;
type NextVerbForVerb<TVerb extends HydraVerb> = TVerb extends keyof NextVerbMatrix
  ? NextVerbMatrix[TVerb & keyof NextVerbMatrix][number]
  : HydraVerb;

type NormalizeVerb<TVerb extends string> = TVerb extends `${infer Head}-${infer Tail}` ? `${Head}::${Tail}` : TVerb;
type NormalizeRoute<T extends string> = T extends `${infer V}/${infer D}/${infer S}/${infer I}`
  ? `${NormalizeVerb<V>}/${D}/${S}/${I}`
  : never;

export type HydraRouteEnvelope<T extends string> =
  T extends `${infer V}/${infer D}/${infer S}/${infer I}`
    ? V extends HydraVerb
      ? D extends HydraDomain
        ? S extends HydraScope
          ? I extends HydraSegment
            ? {
                readonly route: T;
                readonly normalized: NormalizeRoute<T>;
                readonly verb: V;
                readonly domain: D;
                readonly scope: S;
                readonly segment: I;
                readonly stage: VerbStage<V>;
                readonly severity: HydraSeverityFromScope<S>;
                readonly score: HydraScore<HydraSeverityFromScope<S>>;
                readonly nextCandidates: V extends keyof NextVerbMatrix
                  ? NextVerbMatrix[V & keyof NextVerbMatrix]
                  : HydraVerb;
                readonly domainProfile: DomainProfile<D & HydraDomain>;
                readonly actionProfile: ActionProfile<V & HydraVerb>;
              }
            : never
          : never
        : never
      : never
    : never;

export type HydraEnvelopeDistribution<T extends string> =
  T extends string ? HydraRouteEnvelope<T> : never;

export type HydraUnionDistributive<T extends readonly string[]> = {
  [K in keyof T]: T[K] extends `${string}/${string}/${string}/${string}`
    ? HydraEnvelopeDistribution<T[K] & string>
    : never;
};

export type HydraRouteLookup<T extends readonly HydraRoute[]> = {
  [K in keyof T as K extends number ? `route:${K}` : never]: T[K] & HydraRoute;
};

export type HydraNestedTemplateTransform<T extends Record<string, unknown>> = {
  [K in keyof T as K extends string ? `hydra.${K}` : never]: {
    readonly raw: K & string;
    readonly value:
      T[K] extends Record<string, unknown>
        ? HydraNestedTemplateTransform<T[K] & Record<string, unknown>>
        : T[K];
  };
};

export type HydraDeepChain<T extends HydraVerb, Depth extends number, History extends readonly unknown[] = []> = Depth extends 0
  ? {
      readonly terminal: true;
      readonly depth: 0;
      readonly history: [...History, `complete:${T}`];
    }
  : {
      readonly terminal: false;
      readonly depth: Depth;
      readonly route: T;
      readonly next: HydraDeepChain<
        NextVerbForVerb<T>,
        Decrement<Depth>,
        [...History, T]
      >;
    };

export type HydraChainState<TTuple extends readonly HydraRoute[]> = {
  readonly tuple: TTuple;
  readonly length: TTuple['length'];
  readonly catalog: HydraRouteLookup<TTuple>;
  readonly union: HydraEnvelopeDistribution<TTuple[number] & string>;
  readonly transformed: HydraNestedTemplateTransform<{
    tuple: { [K in keyof TTuple]: TTuple[K] & string };
    history: readonly string[];
  }>;
};

export type HydraResolveRouteTuple<
  TTuple extends readonly string[],
  Depth extends number = 8,
  Acc extends readonly unknown[] = [],
> = TTuple extends readonly [infer Head, ...infer Tail]
  ? Head extends HydraRoute
    ? HydraChainState<[...HydraRoutesSeed, Head]> & {
        readonly step: Head;
        readonly stepIndex: Acc['length'];
        readonly path: [...Acc, Head];
        readonly recursive: Depth extends 0
          ? never
          : HydraResolveRouteTuple<Extract<Tail, readonly string[]>, Depth extends 0 ? 0 : Decrement<Depth>, [...Acc, Head]>;
      }
    : HydraResolveRouteTuple<Extract<Tail, readonly string[]>, Decrement<Depth>, Acc>
  : {
      readonly terminal: true;
      readonly step: never;
      readonly path: Acc;
    };

type HydraRoutesSeed = readonly [
  'bootstrap/atlas/seed/id-1',
  'ingest/drill/run/id-2',
  'validate/risk/closure/id-3',
  'synthesize/mesh/loop/id-4',
  'restore/quantum/restore/id-5',
];

export type HydraCatalog = typeof hydraRouteSeeds;
export const hydraRouteSeeds = [
  'bootstrap/atlas/seed/id-1',
  'ingest/drill/run/id-2',
  'validate/risk/closure/id-3',
  'synthesize/mesh/loop/id-4',
  'restore/quantum/restore/id-5',
  'drill/incident/closure/id-6',
  'audit/playbook/trace/id-7',
  'mesh-check/dispatch/fallback/id-8',
  'heal/recovery/closure/id-9',
  'resource-heal/gateway/rollback/id-10',
  'policy-enforce/policy/alert/id-11',
  'safety-guard/observer/signal/id-12',
  'latency-loop/catalog/observe/id-13',
  'state-rollback/registry/terminal/id-14',
  'topology-drift/workflow/drain/id-15',
  'signal-stabilize/telemetry/observe/id-16',
  'workload-shape/queue/zone/id-17',
  'incident-close/recovery/plan/id-18',
  'mesh-evict/container/dispatch/id-19',
  'policy-override/governance/audit/id-20',
  'compliance-audit/registry/review/id-21',
  'policy-reinforce/ops/quarantine/id-22',
] as const;

export type HydraCatalogState = ReadonlyArray<HydraRouteEnvelope<(typeof hydraRouteSeeds)[number]>>;

export type HydraTemplateTuple<T extends HydroaTupleSize = HydroaTupleSize> = {
  readonly path: T;
  readonly normalized: NormalizeRoute<T & string>;
  readonly parsed: HydraRouteEnvelope<T & string>;
};

type HydraTemplateBase =
  | `atlas/${string}/${string}/id-${number}`
  | `drill/${string}/${string}/urn-${string}`;
export type HydraTemplateMatrix = {
  readonly [K in HydraSegment]: K extends `id-${number}` ? `seed:${K}` : `dynamic:${K}`;
};

export type HydraRouteCommand<T extends string> = T extends `/${infer Left}/${infer Mid}/${infer Tail}`
  ? never
  : T extends `${infer Left}/${infer Mid}/${infer Tail}`
    ? { readonly left: Left; readonly mid: Mid; readonly tail: Tail; readonly route: T }
    : never;

export type HydraInferenceResult<T extends string> =
  T extends `${infer V}-${infer _}-${infer S}` ? `${V}:${S}` : T;

type HydraRoutePattern<T extends string> =
  T extends `${infer V}/${infer D}/${infer S}/${infer I}`
    ? `${V & string}::${D & string}::${S & string}::${I & string}`
    : never;

export type HydraRoutePatternUnion = HydraRoutePattern<HydraCatalog[number]>;

export type HydraPatternMatch<T extends string> =
  T extends `${string}::${infer Domain}::${infer Scope}::${infer Segment}`
    ? {
        readonly domain: Domain;
        readonly scope: Scope;
        readonly segment: Segment;
      }
    : never;

type HydroaTupleSize = `${string & {}}/${string & {}}/${string & {}}/${HydraNumericSegment}`;
export type HydraRouteTupleMap<T extends readonly HydroaTupleSize[]> = {
  [K in keyof T]: HydraRouteEnvelope<T[K]>;
};

type RouteTupleMap = HydraRouteTupleMap<typeof hydraRouteSeeds>;
type RouteTemplateMap = {
  [K in keyof RouteTupleMap]: RouteTupleMap[K] extends infer M
    ? M extends { readonly route: infer R }
      ? R & string
      : never
    : never;
};

export const normalizeHydraRoute = (route: string): Record<string, unknown> => {
  const [segment0, segment1, segment2] = route.split('/');
  const verb = segment0 as HydraVerb;
  const domain = segment1 as HydraDomain;
  const scope = segment2 as HydraScope;
  const normalized = `${verb.replace('-', ':')}/${domain}/${scope}/id-1` as HydraRoute;
  return {
    route,
    normalized,
    verb,
    domain,
    scope,
    segment: 'id-1',
    stage: 'analysis',
    severity: scope === 'seed' || scope === 'run' ? 'low' : 'medium',
    score: 27,
    nextCandidates: ['bootstrap'],
    domainProfile: {
      scope: 'catalog',
      tier: domain.length,
      criticality: 'low',
    },
    actionProfile: {
    phase: 'start',
    weight: 1,
    requires: ['core'],
  },
  };
};

export const buildHydraCatalogProfile = (routes: readonly string[]) => {
  const catalog = routes.reduce<Record<string, string>>((acc, route, index) => {
    return { ...acc, [`route:${index}`]: route };
  }, {});
  const transformed = Object.fromEntries(
    routes.map((route, index) => [`hydra.${route}-${index}`, { raw: route, value: route }]),
  );

  return {
    tuple: routes,
    length: routes.length,
    catalog,
    union: routes.map((route) => hydraRouteEnvelope(route)),
    transformed: transformed as Record<string, { raw: string; value: string }>,
  };
};

export const hydraRouteEnvelope = (route: string) => normalizeHydraRoute(route);

export const buildHydraDeepChain = (start: HydraVerb, depth: number): {
  readonly head: HydraVerb;
  readonly depth: number;
  readonly chain: readonly string[];
} => {
  const chain: string[] = [start];
  let cursor: string = start;
  let steps = 0;
  while (steps < depth) {
    const next = (nextVerbMatrix[cursor as keyof typeof nextVerbMatrix] as readonly string[] | undefined)?.[steps % 2] as
      | HydraVerb
      | undefined;
    if (next === undefined) {
      break;
    }
    chain.push(next);
    cursor = next;
    steps += 1;
  }
  return {
    head: start,
    depth,
    chain,
  };
};

export const hydraMapTemplates = <T extends Record<string, unknown>>(
  payload: T,
): HydraNestedTemplateTransform<T> =>
  Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [
      `hydra.${key}`,
      {
        raw: key,
        value: value as T[keyof T],
      },
    ]),
  ) as HydraNestedTemplateTransform<T>;

export type HydraRoutePayload<T extends string> = HydraRouteEnvelope<T> extends infer R ? Omit<R & object, 'nextCandidates'> : never;
export type HydraDistributeByVerb<T extends HydraVerb> = HydraRouteEnvelope<HydraRoute> extends infer R ? Extract<R, { readonly verb: T }> : never;
