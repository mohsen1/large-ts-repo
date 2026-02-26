import type { Brand } from './patterns';

export type NoInfer<T> = [T][T extends any ? 0 : never];

export type StressEntity =
  | 'agent'
  | 'artifact'
  | 'auth'
  | 'autonomous-node'
  | 'backplane'
  | 'burst'
  | 'cache'
  | 'canary'
  | 'cluster'
  | 'command'
  | 'connector'
  | 'control'
  | 'container'
  | 'contract'
  | 'continuity'
  | 'dashboard'
  | 'datastore'
  | 'decision'
  | 'edge'
  | 'event'
  | 'fabric'
  | 'fleet'
  | 'forecast'
  | 'gateway'
  | 'incident'
  | 'intent'
  | 'lab'
  | 'lifecycle'
  | 'mesh'
  | 'orchestrator'
  | 'policy'
  | 'playbook'
  | 'provision'
  | 'queue'
  | 'recovery'
  | 'registry'
  | 'relay'
  | 'route'
  | 'scenario'
  | 'signal'
  | 'storage'
  | 'telemetry'
  | 'timeline'
  | 'workload';

export type StressVerb =
  | 'discover'
  | 'observe'
  | 'drill'
  | 'plan'
  | 'adapt'
  | 'sweep'
  | 'audit'
  | 'simulate'
  | 'synthesize'
  | 'dispatch'
  | 'reconcile'
  | 'route'
  | 'snapshot'
  | 'restore'
  | 'rebalance'
  | 'throttle'
  | 'inject'
  | 'contain'
  | 'heal'
  | 'escalate'
  | 'degrade'
  | 'stabilize'
  | 'verify';

export type StressSeverity = 'low' | 'moderate' | 'high' | 'critical' | 'emergency' | 'observability';
export type StressMode = 'live' | 'dry-run' | 'simulation' | 'replay' | 'backfill' | 'forecast';

export type BuildRange<Length extends number, Acc extends number[] = []> =
  Acc['length'] extends Length ? Acc : BuildRange<Length, [...Acc, Acc['length']]>;

export type Decrement<N extends number> = N extends 0 ? 0 : number;

export type Increment<N extends number> = `${N}`;

export type RouteTuple<N extends number, Seed extends string = 'node'> = N extends 0
  ? Seed
  : `${Seed}${Increment<N>}`;

export type CommandRoute = `/${StressEntity}/${StressVerb}/${StressMode}/${StressSeverity}`;

export type StressRouteCatalog = {
  readonly edge: readonly ['/agent/discover/live/low', '/agent/reconcile/live/high', '/mesh/recover/simulation/critical'];
  readonly core: readonly ['/gateway/observe/live/low', '/control/verify/live/critical', '/playbook/adapt/simulation/high'];
  readonly replay: readonly ['/signal/dispatch/replay/observability', '/timeline/simulate/backfill/high'];
};

type ResolveVerb<T extends StressVerb> =
  T extends 'discover'
    ? { readonly verb: T; readonly action: 'scan'; readonly channel: 'read'; readonly score: 9 }
    : T extends 'observe'
      ? { readonly verb: T; readonly action: 'watch'; readonly channel: 'stream'; readonly score: 6 }
      : T extends 'drill'
        ? { readonly verb: T; readonly action: 'execute'; readonly channel: 'chaos'; readonly score: 7 }
        : T extends 'plan'
          ? { readonly verb: T; readonly action: 'synthesize'; readonly channel: 'planner'; readonly score: 8 }
          : T extends 'adapt'
            ? { readonly verb: T; readonly action: 'adjust'; readonly channel: 'optimizer'; readonly score: 8 }
            : T extends 'sweep'
              ? { readonly verb: T; readonly action: 'prune'; readonly channel: 'policy'; readonly score: 5 }
              : T extends 'audit'
                ? { readonly verb: T; readonly action: 'verify'; readonly channel: 'governance'; readonly score: 10 }
                : T extends 'simulate'
                  ? { readonly verb: T; readonly action: 'dryrun'; readonly channel: 'predict'; readonly score: 4 }
                  : T extends 'synthesize'
                    ? { readonly verb: T; readonly action: 'compose'; readonly channel: 'builder'; readonly score: 7 }
                    : T extends 'dispatch'
                      ? { readonly verb: T; readonly action: 'publish'; readonly channel: 'events'; readonly score: 8 }
                      : T extends 'reconcile'
                        ? { readonly verb: T; readonly action: 'heal'; readonly channel: 'planner'; readonly score: 9 }
                        : T extends 'route'
                          ? { readonly verb: T; readonly action: 'direct'; readonly channel: 'topology'; readonly score: 7 }
                          : T extends 'snapshot'
                            ? { readonly verb: T; readonly action: 'freeze'; readonly channel: 'store'; readonly score: 5 }
                            : T extends 'restore'
                              ? { readonly verb: T; readonly action: 'revive'; readonly channel: 'store'; readonly score: 10 }
                              : T extends 'rebalance'
                                ? { readonly verb: T; readonly action: 'redistribute'; readonly channel: 'mesh'; readonly score: 6 }
                                : T extends 'throttle'
                                  ? { readonly verb: T; readonly action: 'pressure'; readonly channel: 'gate'; readonly score: 5 }
                                  : T extends 'inject'
                                    ? { readonly verb: T; readonly action: 'inject'; readonly channel: 'chaos'; readonly score: 7 }
                                    : T extends 'contain'
                                      ? { readonly verb: T; readonly action: 'isolate'; readonly channel: 'security'; readonly score: 9 }
                                      : T extends 'heal'
                                        ? { readonly verb: T; readonly action: 'repair'; readonly channel: 'incident'; readonly score: 10 }
                                        : T extends 'escalate'
                                          ? { readonly verb: T; readonly action: 'raise'; readonly channel: 'ops'; readonly score: 6 }
                                          : T extends 'degrade'
                                            ? { readonly verb: T; readonly action: 'slow'; readonly channel: 'policy'; readonly score: 4 }
                                            : T extends 'stabilize'
                                              ? { readonly verb: T; readonly action: 'normalize'; readonly channel: 'ops'; readonly score: 8 }
                                              : T extends 'verify'
                                                ? { readonly verb: T; readonly action: 'inspect'; readonly channel: 'quality'; readonly score: 6 }
                                                : { readonly verb: T; readonly action: 'noop'; readonly channel: 'fallback'; readonly score: 1 };

export type ResolveEntity<T extends StressEntity> =
  T extends 'agent'
    ? { readonly layer: 'runtime'; readonly mutable: true }
    : T extends 'artifact'
      ? { readonly layer: 'asset'; readonly mutable: false }
      : T extends 'auth'
        ? { readonly layer: 'security'; readonly mutable: true }
        : T extends 'autonomous-node'
          ? { readonly layer: 'agentic'; readonly mutable: true }
          : T extends 'backplane'
            ? { readonly layer: 'infra'; readonly mutable: true }
            : T extends 'burst'
              ? { readonly layer: 'capacity'; readonly mutable: false }
              : T extends 'cache'
                ? { readonly layer: 'storage'; readonly mutable: true }
                : T extends 'canary'
                  ? { readonly layer: 'release'; readonly mutable: false }
                  : T extends 'cluster'
                    ? { readonly layer: 'infra'; readonly mutable: true }
                    : T extends 'command'
                      ? { readonly layer: 'control'; readonly mutable: false }
                      : T extends 'connector'
                        ? { readonly layer: 'network'; readonly mutable: true }
                        : T extends 'control'
                          ? { readonly layer: 'runtime'; readonly mutable: true }
                          : T extends 'container'
                            ? { readonly layer: 'k8s'; readonly mutable: true }
                            : T extends 'contract'
                              ? { readonly layer: 'policy'; readonly mutable: false }
                              : T extends 'continuity'
                                ? { readonly layer: 'resilience'; readonly mutable: true }
                                : T extends 'dashboard'
                                  ? { readonly layer: 'ui'; readonly mutable: false }
                                  : T extends 'datastore'
                                    ? { readonly layer: 'storage'; readonly mutable: true }
                                    : T extends 'decision'
                                      ? { readonly layer: 'planner'; readonly mutable: false }
                                      : T extends 'edge'
                                        ? { readonly layer: 'network'; readonly mutable: true }
                                        : T extends 'event'
                                          ? { readonly layer: 'events'; readonly mutable: false }
                                          : T extends 'fabric'
                                            ? { readonly layer: 'mesh'; readonly mutable: true }
                                            : T extends 'fleet'
                                              ? { readonly layer: 'ops'; readonly mutable: true }
                                              : T extends 'forecast'
                                                ? { readonly layer: 'predict'; readonly mutable: false }
                                                : T extends 'gateway'
                                                  ? { readonly layer: 'ingress'; readonly mutable: true }
                                                  : T extends 'incident'
                                                    ? { readonly layer: 'incident'; readonly mutable: true }
                                                    : T extends 'intent'
                                                      ? { readonly layer: 'governance'; readonly mutable: false }
                                                      : T extends 'lab'
                                                        ? { readonly layer: 'validation'; readonly mutable: true }
                                                        : T extends 'lifecycle'
                                                          ? { readonly layer: 'change'; readonly mutable: true }
                                                          : T extends 'mesh'
                                                            ? { readonly layer: 'topology'; readonly mutable: true }
                                                            : T extends 'orchestrator'
                                                              ? { readonly layer: 'control'; readonly mutable: true }
                                                              : T extends 'policy'
                                                                ? { readonly layer: 'policy'; readonly mutable: false }
                                                                : T extends 'playbook'
                                                                  ? { readonly layer: 'runbook'; readonly mutable: true }
                                                                  : T extends 'provision'
                                                                    ? { readonly layer: 'platform'; readonly mutable: true }
                                                                    : T extends 'queue'
                                                                      ? { readonly layer: 'delivery'; readonly mutable: false }
                                                                      : T extends 'recovery'
                                                                        ? { readonly layer: 'ops'; readonly mutable: true }
                                                                        : T extends 'registry'
                                                                          ? { readonly layer: 'catalog'; readonly mutable: true }
                                                                          : T extends 'relay'
                                                                            ? { readonly layer: 'switch'; readonly mutable: true }
                                                                            : T extends 'route'
                                                                              ? { readonly layer: 'routing'; readonly mutable: false }
                                                                              : T extends 'scenario'
                                                                                ? { readonly layer: 'plan'; readonly mutable: true }
                                                                                : T extends 'signal'
                                                                                  ? { readonly layer: 'telemetry'; readonly mutable: false }
                                                                                  : T extends 'storage'
                                                                                    ? { readonly layer: 'persistence'; readonly mutable: true }
                                                                                    : T extends 'telemetry'
                                                                                      ? { readonly layer: 'observability'; readonly mutable: true }
                                                                                      : T extends 'timeline'
                                                                                        ? { readonly layer: 'history'; readonly mutable: false }
                                                                                        : { readonly layer: 'misc'; readonly mutable: true };

export type RouteSeverityWeight<TSeverity extends StressSeverity> =
  TSeverity extends 'low'
    ? 1
    : TSeverity extends 'moderate'
      ? 2
      : TSeverity extends 'high'
        ? 4
        : TSeverity extends 'critical'
          ? 8
          : TSeverity extends 'emergency'
            ? 16
            : 5;

export type ResolveRoute<T extends string> = T extends `/${infer D}/${infer V}/${infer M}/${infer S}`
  ? D extends StressEntity
    ? V extends StressVerb
      ? M extends StressMode
        ? S extends StressSeverity
          ? ResolveVerb<V> & ResolveEntity<D> & {
              readonly mode: M;
              readonly severity: S;
              readonly endpoint: Brand<string, 'endpoint'>;
              readonly routeWeight: RouteSeverityWeight<S>;
            }
          : never
        : never
      : never
    : never
  : never;

export type RouteCatalog =
  | '/agent/discover/live/low'
  | '/agent/plan/simulation/high'
  | '/agent/recover/replay/critical'
  | '/mesh/dispatch/live/high'
  | '/mesh/observe/simulation/moderate'
  | '/command/audit/backfill/observability'
  | '/playbook/synthesize/live/critical'
  | '/incident/contain/live/high'
  | '/incident/restore/simulation/high'
  | '/route/route/live/low'
  | '/timeline/plan/dry-run/moderate'
  | '/policy/verify/live/critical'
  | '/telemetry/verify/live/low'
  | '/recovery/heal/live/critical'
  | '/telemetry/simulate/forecast/high'
  | '/signal/dispatch/dry-run/low'
  | '/control/dispatch/simulation/high';

export type DistributiveResolve<T extends RouteCatalog> = T extends unknown ? ResolveRoute<T> : never;

export type RouteResolutionChain<T extends RouteCatalog, Acc = []> = T extends infer Head
  ? Head extends RouteCatalog
    ? [ResolveRoute<Head>, ...DistributiveResolve<Exclude<T, Head>> extends never ? [] : RouteResolutionChain<Exclude<T, Head>>]
    : []
  : [];

export type RouteInputBag = Record<string, unknown>;

export type TemplateRemap<T extends RouteInputBag> = {
  [K in keyof T as K extends string ? `route:${K}` : never]: T[K] extends Record<string, unknown>
    ? TemplateRemap<T[K]>
    : T[K];
};

export type NestedTemplateRemap<T extends RouteInputBag> = {
  [K in keyof T as K extends string ? `outer/${K}` : never]:
    T[K] extends Array<infer U>
      ? ReadonlyArray<U>
      : T[K] extends Record<string, unknown>
        ? {
            [R in keyof T[K] as R extends string ? `inner/${R}` : never]: T[K][R];
          }
        : T[K];
};

export interface RouteEnvelopeCore {
  readonly id: Brand<string, 'route-id'>;
  readonly route: string;
  readonly resolved: DistributiveResolve<RouteCatalog>;
}

export interface RouteEnvelopeMeta extends RouteEnvelopeCore {
  readonly domain: StressEntity;
  readonly verb: StressVerb;
}

export interface RouteEnvelopeMetaVerbose extends RouteEnvelopeMeta {
  readonly severity: StressSeverity;
  readonly mode: StressMode;
  readonly tags: TemplateRemap<{ readonly primary: string; readonly secondary: string; readonly flags: readonly string[] }>;
}

export type RouteEnvelope<T extends RouteCatalog> = {
  readonly path: T;
  readonly payload: ResolveRoute<T>;
} & RouteEnvelopeCore & RouteEnvelopeMeta & RouteEnvelopeMetaVerbose;

export const stressRouteCatalog = [
  '/agent/discover/live/low',
  '/agent/plan/simulation/high',
  '/agent/recover/replay/critical',
  '/mesh/dispatch/live/high',
  '/mesh/observe/simulation/moderate',
  '/command/audit/backfill/observability',
  '/playbook/synthesize/live/critical',
  '/incident/contain/live/high',
  '/incident/restore/simulation/high',
  '/route/route/live/low',
  '/timeline/plan/dry-run/moderate',
  '/policy/verify/live/critical',
  '/telemetry/verify/live/low',
  '/recovery/heal/live/critical',
  '/telemetry/simulate/forecast/high',
  '/signal/dispatch/dry-run/low',
  '/control/dispatch/simulation/high',
] as const satisfies readonly RouteCatalog[];

export type RouteCatalogUnion = (typeof stressRouteCatalog)[number];

export const routeProfile = {
  entityCount: stressRouteCatalog.length,
  maxScore: 16,
  mode: 'simulation',
  domain: 'recovery',
} as const;

export type RouteProfile = typeof routeProfile;

export type DeeperProfile<T extends string, Depth extends number> = Depth extends 0
  ? {
      readonly key: 'depth-0';
      readonly source: T;
      readonly next: never;
    }
  : {
      readonly key: `depth-${Depth}`;
      readonly source: T;
      readonly next: DeeperProfile<T, Decrement<Depth>>;
    };

export type ParseRouteSegments<T extends string> = T extends `/${infer Head}/${infer Tail}`
  ? [Head, ...ParseRouteSegments<Tail>]
  : T extends ''
    ? []
    : [T];

export type RouteSignatureFromSegments<Segments extends readonly string[]> = Segments extends [
  infer Head,
  ...infer Rest,
]
  ? Head extends string
    ? Rest extends string[]
      ? `${Head}/${RouteSignatureFromSegments<Rest>}`
      : Head
    : never
  : '';

export type CanonicalRouteSignature<T extends string> = RouteSignatureFromSegments<ParseRouteSegments<T>>;

export type BuildRouteSignature<T extends string> =
  T extends `${infer Entity}/${infer Verb}`
    ? `${T}-${Entity & string}-${Verb & string}`
    : `missing-${T}`;

export type ParsedRouteIdentity<T extends string> =
  T extends `/${infer Entity}/${infer Verb}/${infer Mode}/${infer Severity}`
    ? {
        readonly parse: {
          readonly entity: Entity;
          readonly verb: Verb;
          readonly mode: Mode;
          readonly severity: Severity;
        };
        readonly normalized: BuildRouteSignature<`${Entity}/${Verb}`>;
      }
    : never;

export type RouteIdentityPipeline<T extends readonly string[]> = {
  readonly [K in keyof T]: ParsedRouteIdentity<Extract<T[K], string>>;
};

export const routeIdentityPipeline: RouteIdentityPipeline<typeof stressRouteCatalog> =
  stressRouteCatalog.map((route) => parseRoute(route)) as unknown as RouteIdentityPipeline<typeof stressRouteCatalog>;

export const parseRoute = <T extends RouteCatalogUnion>(route: T): ParsedRouteIdentity<T> => {
  const [_, entity, verb, mode, severity] = route.split('/') as [
    string,
    string,
    string,
    string,
    string,
  ];
  return {
    parse: {
      entity,
      verb,
      mode,
      severity,
    },
    normalized: `${entity}-${verb}` as BuildRouteSignature<`${string}/${string}`>,
  } as ParsedRouteIdentity<T>;
};

export type RouteMeta<T extends RouteCatalogUnion> = {
  readonly route: T;
  readonly resolved: ParsedRouteIdentity<T>;
  readonly chain: DeeperProfile<T, 12>;
};

export type RouteMetaUnion = RouteMeta<RouteCatalogUnion>;

const buildRouteChain = <T extends RouteCatalogUnion>(route: T, depth: number): DeeperProfile<T, any> => {
  if (depth <= 0) {
    return {
      key: 'depth-0',
      source: route,
      next: undefined as never,
    } as DeeperProfile<T, 0>;
  }

  return {
    key: `depth-${depth}` as const,
    source: route,
    next: buildRouteChain(route, depth - 1),
  } as DeeperProfile<T, number>;
};

/* export const routeEnvelopeMap = new Map<RouteCatalogUnion, RouteMetaUnion>(
  routeIdentityPipeline.map((entry, index) => {
    const route = stressRouteCatalog[index] as RouteCatalogUnion;
    return [route, { route, resolved: entry as ParsedRouteIdentity<RouteCatalogUnion>, chain: { key: `depth-12`, source: route, next: { key: 'depth-11', source: route, next: { key: 'depth-10', source: route, next: { key: 'depth-9', source: route, next: { key: 'depth-8', source: route, next: { key: 'depth-7', source: route, next: { key: 'depth-6', source: route, next: { key: 'depth-5', source: route, next: { key: 'depth-4', source: route, next: { key: 'depth-3', source: route, next: { key: 'depth-2', source: route, next: { key: 'depth-1', source: route, next: { key: 'depth-0', source: route, next: { key: 'depth-0', source: route, next: { key: 'depth-0', source: route, next: { key: 'depth-0', source: route, next: { key: 'depth-0', source: route, next: { key: 'depth-0', source: route, next: { key: 'depth-0', source: route, next: { key: 'depth-0', source: route, next: { key: 'depth-0', source: route, next: { key: 'depth-0', source: route, next: { key: 'depth-0', source: route, next: { key: 'depth-0', source: route, next: { key: 'depth-0', source: route, next: { key: 'depth-0', source: route, next: { key: 'depth-0', source: route, next: { key: 'depth-0', source: route, next: { key: 'depth-0', source: route, next: { key: 'depth-0', source: route, next: { key: 'depth-0', source: route, next: { key: 'depth-0', source: route, next: { key: 'depth-0', source: route, next: { key: 'depth-0', source: route, next: { key: 'depth-0', source: route, next: { key: 'depth-0', source: route, next: { key: 'depth-0', source: route, next: { key: 'depth-0', source: route, next: { key: 'depth-0', source: route, next: { key: 'depth-0', source: route, next: { key: 'depth-0', source: route, next: { key: 'depth-0', source: route, next: route } } } } } } } } } } } } } } } } } } } } } } } } } } } } } } } } } } } as DeeperProfile<RouteCatalogUnion, 12> } }]
); */

export const routeEnvelopeMap = new Map<RouteCatalogUnion, RouteMetaUnion>(
  routeIdentityPipeline.map((entry, index) => {
    const route = stressRouteCatalog[index] as RouteCatalogUnion;
    const chain = buildRouteChain(route, 12) as unknown as DeeperProfile<typeof route, 12>;
    return [
      route,
      {
        route,
        resolved: entry,
        chain,
      } as unknown as RouteMetaUnion,
    ] as [RouteCatalogUnion, RouteMetaUnion];
  }),
);
