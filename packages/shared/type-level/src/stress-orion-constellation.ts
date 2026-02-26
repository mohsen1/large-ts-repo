export type OrbiDomain =
  | 'incident'
  | 'workflow'
  | 'fabric'
  | 'policy'
  | 'telemetry'
  | 'safety'
  | 'recovery'
  | 'analytics'
  | 'drill'
  | 'audit'
  | 'continuity'
  | 'resilience'
  | 'mesh'
  | 'orchestration'
  | 'timeline'
  | 'command'
  | 'signal'
  | 'runtime'
  | 'intelligence'
  | 'strategy'
  | 'portfolio';

export type OrbiVerb =
  | 'compose'
  | 'simulate'
  | 'verify'
  | 'reconcile'
  | 'observe'
  | 'drill'
  | 'dispatch'
  | 'archive'
  | 'route'
  | 'synchronize'
  | 'replay'
  | 'recovery'
  | 'audit';

export type OrbiCluster =
  | 'atlas'
  | 'vector'
  | 'horizon'
  | 'signal'
  | 'mesh'
  | 'timeline'
  | 'policy'
  | 'fabric'
  | 'command'
  | 'runtime';

export type OrbiSeverity =
  | 'critical'
  | 'high'
  | 'medium'
  | 'low'
  | 'maintenance'
  | 'info';

export type OrbiTag = `tag-${string}`;
export type RawOrbiRoute = `/${string}/${string}/${string}/${string}/${string}`;

export interface OrbiNodeRoot {
  readonly stage: number;
  readonly marker: 'root';
}

export interface OrbiNodeOne extends OrbiNodeRoot {
  readonly stage: number;
  readonly token: string;
}
export interface OrbiNodeTwo extends OrbiNodeOne {
  readonly stage: number;
  readonly token: string;
}
export interface OrbiNodeThree extends OrbiNodeTwo {
  readonly stage: number;
  readonly token: string;
}
export interface OrbiNodeFour extends OrbiNodeThree {
  readonly stage: number;
  readonly token: string;
}
export interface OrbiNodeFive extends OrbiNodeFour {
  readonly stage: number;
  readonly token: string;
}
export interface OrbiNodeSix extends OrbiNodeFive {
  readonly stage: number;
  readonly token: string;
}
export interface OrbiNodeSeven extends OrbiNodeSix {
  readonly stage: number;
  readonly token: string;
}
export interface OrbiNodeEight extends OrbiNodeSeven {
  readonly stage: number;
  readonly token: string;
}
export interface OrbiNodeNine extends OrbiNodeEight {
  readonly stage: number;
  readonly token: string;
}
export interface OrbiNodeTen extends OrbiNodeNine {
  readonly stage: number;
  readonly token: string;
}
export interface OrbiNodeEleven extends OrbiNodeTen {
  readonly stage: number;
  readonly token: string;
}
export interface OrbiNodeTwelve extends OrbiNodeEleven {
  readonly stage: number;
  readonly token: string;
}
export interface OrbiNodeThirteen extends OrbiNodeTwelve {
  readonly stage: number;
  readonly token: string;
}
export interface OrbiNodeFourteen extends OrbiNodeThirteen {
  readonly stage: number;
  readonly token: string;
}
export interface OrbiNodeFifteen extends OrbiNodeFourteen {
  readonly stage: number;
  readonly token: string;
}
export interface OrbiNodeSixteen extends OrbiNodeFifteen {
  readonly stage: number;
  readonly token: string;
}
export interface OrbiNodeSeventeen extends OrbiNodeSixteen {
  readonly stage: number;
  readonly token: string;
}
export interface OrbiNodeEighteen extends OrbiNodeSeventeen {
  readonly stage: number;
  readonly token: string;
}
export interface OrbiNodeNineteen extends OrbiNodeEighteen {
  readonly stage: number;
  readonly token: string;
}
export interface OrbiNodeTwenty extends OrbiNodeNineteen {
  readonly stage: number;
  readonly token: string;
}
export interface OrbiNodeTwentyOne extends OrbiNodeTwenty {
  readonly stage: number;
  readonly token: string;
}
export interface OrbiNodeTwentyTwo extends OrbiNodeTwentyOne {
  readonly stage: number;
  readonly token: string;
}
export interface OrbiNodeTwentyThree extends OrbiNodeTwentyTwo {
  readonly stage: number;
  readonly token: string;
}
export interface OrbiNodeTwentyFour extends OrbiNodeTwentyThree {
  readonly stage: number;
  readonly token: string;
}
export interface OrbiNodeTwentyFive extends OrbiNodeTwentyFour {
  readonly stage: number;
  readonly token: string;
}
export interface OrbiNodeTwentySix extends OrbiNodeTwentyFive {
  readonly stage: number;
  readonly token: string;
}
export interface OrbiNodeTwentySeven extends OrbiNodeTwentySix {
  readonly stage: number;
  readonly token: string;
}
export interface OrbiNodeTwentyEight extends OrbiNodeTwentySeven {
  readonly stage: number;
  readonly token: string;
}
export interface OrbiNodeTwentyNine extends OrbiNodeTwentyEight {
  readonly stage: number;
  readonly token: string;
}
export interface OrbiNodeThirty extends OrbiNodeTwentyNine {
  readonly stage: number;
  readonly token: string;
}

export type OrbiNodeDeepChain =
  | OrbiNodeRoot
  | OrbiNodeOne
  | OrbiNodeTwo
  | OrbiNodeThree
  | OrbiNodeFour
  | OrbiNodeFive
  | OrbiNodeSix
  | OrbiNodeSeven
  | OrbiNodeEight
  | OrbiNodeNine
  | OrbiNodeTen
  | OrbiNodeEleven
  | OrbiNodeTwelve
  | OrbiNodeThirteen
  | OrbiNodeFourteen
  | OrbiNodeFifteen
  | OrbiNodeSixteen
  | OrbiNodeSeventeen
  | OrbiNodeEighteen
  | OrbiNodeNineteen
  | OrbiNodeTwenty
  | OrbiNodeTwentyOne
  | OrbiNodeTwentyTwo
  | OrbiNodeTwentyThree
  | OrbiNodeTwentyFour
  | OrbiNodeTwentyFive
  | OrbiNodeTwentySix
  | OrbiNodeTwentySeven
  | OrbiNodeTwentyEight
  | OrbiNodeTwentyNine
  | OrbiNodeThirty;

export type NoInfer<T> = [T][T extends any ? 0 : never];

export const orbiCatalogSource = [
  '/incident/compose/atlas/critical/tag-001',
  '/incident/simulate/vector/high/tag-002',
  '/incident/reconcile/policy/medium/tag-003',
  '/incident/observe/timeline/low/tag-004',
  '/incident/drill/runtime/maintenance/tag-005',
  '/incident/dispatch/signal/info/tag-006',
  '/incident/replay/fabric/info/tag-007',
  '/incident/archive/command/info/tag-008',
  '/workflow/compose/mesh/high/tag-009',
  '/workflow/simulate/vector/critical/tag-010',
  '/workflow/verify/atlas/info/tag-011',
  '/workflow/route/policy/low/tag-012',
  '/workflow/replay/signal/info/tag-013',
  '/workflow/archive/command/high/tag-014',
  '/fabric/compose/horizon/maintenance/tag-015',
  '/fabric/verify/signal/critical/tag-016',
  '/fabric/reconcile/runtime/medium/tag-017',
  '/fabric/observe/atlas/low/tag-018',
  '/fabric/replay/mesh/info/tag-019',
  '/fabric/dispatch/timeline/high/tag-020',
  '/policy/compose/policy/high/tag-021',
  '/policy/route/policy/critical/tag-022',
  '/policy/verify/command/medium/tag-023',
  '/policy/synchronize/timeline/low/tag-024',
  '/telemetry/compose/signal/info/tag-025',
  '/telemetry/simulate/vector/low/tag-026',
  '/telemetry/verify/atlas/high/tag-027',
  '/telemetry/synchronize/policy/medium/tag-028',
  '/safety/reconcile/command/critical/tag-029',
  '/safety/simulate/runtime/high/tag-030',
  '/recovery/compose/runtime/critical/tag-031',
  '/analytics/simulate/vector/high/tag-032',
  '/analytics/verify/horizon/maintenance/tag-033',
  '/analytics/replay/atlas/info/tag-034',
  '/analytics/dispatch/command/high/tag-035',
  '/drill/compose/signal/high/tag-036',
  '/drill/simulate/runtime/medium/tag-037',
  '/audit/replay/mesh/info/tag-038',
  '/continuity/route/atlas/maintenance/tag-039',
  '/resilience/compose/timeline/low/tag-040',
  '/intelligence/simulate/mesh/high/tag-041',
] as const satisfies readonly RawOrbiRoute[];

export type OrbiRoute = (typeof orbiCatalogSource)[number];
export type RouteSeverityBucket<T extends OrbiSeverity> = T extends 'critical'
  ? 5
  : T extends 'high'
    ? 4
    : T extends 'medium'
      ? 3
      : T extends 'low'
        ? 2
        : T extends 'maintenance'
          ? 1
          : 0;

export type OrbiRouteParts<T extends OrbiRoute> =
  T extends `/${infer D}/${infer V}/${infer C}/${infer S}/${infer I}`
    ? readonly [
        D & OrbiDomain,
        V & OrbiVerb,
        C & OrbiCluster,
        S & OrbiSeverity,
        I & OrbiTag,
      ]
    : never;

type NormalizeRouteVerb<T extends string> = T extends OrbiVerb
  ? T extends 'compose'
    ? 'ingest'
    : T extends 'simulate'
      ? 'dry-run'
      : T extends 'verify'
        ? 'validation'
        : T extends 'reconcile'
          ? 'merge'
          : T extends 'observe'
            ? 'monitor'
            : T extends 'drill'
              ? 'exertion'
              : T extends 'dispatch'
                ? 'issue'
                : T extends 'archive'
                  ? 'store'
                  : T extends 'route'
                    ? 'route'
                    : T extends 'synchronize'
                      ? 'sync'
                      : T extends 'replay'
                        ? 'rerun'
                        : T extends 'recovery'
                          ? 'recover'
                          : 'audit'
  : never;

type RouteDomainShiftClass<T extends OrbiDomain> = T extends 'incident'
  ? 'ops'
  : T extends 'workflow'
    ? 'flow'
    : T extends 'fabric'
      ? 'net'
      : T extends 'policy'
        ? 'policy'
        : T extends 'telemetry'
          ? 'telemetry'
          : T extends 'safety'
            ? 'safety'
            : T extends 'recovery'
              ? 'recovery'
              : T extends 'analytics'
                ? 'analytics'
                : T extends 'drill'
                  ? 'drill'
                  : T extends 'audit'
                    ? 'audit'
                    : T extends 'continuity'
                      ? 'continuity'
                      : T extends 'resilience'
                        ? 'resilience'
                        : T extends 'mesh'
                          ? 'mesh'
                          : T extends 'orchestration'
                            ? 'orchestration'
                            : T extends 'timeline'
                              ? 'timeline'
                              : T extends 'command'
                                ? 'command'
                                : T extends 'signal'
                                  ? 'signal'
                                  : T extends 'runtime'
                                    ? 'runtime'
                                    : T extends 'intelligence'
                                      ? 'intelligence'
                                      : T extends 'strategy'
                                        ? 'strategy'
                                        : T extends 'portfolio'
                                          ? 'portfolio'
                                          : 'general';

export type RoutePattern<T extends OrbiRoute> =
  T extends `/${infer D extends OrbiDomain}/${infer V extends OrbiVerb}/${infer _C}/${infer _S}/${infer _I}`
    ? `/${D}/${NoInfer<V>}`
    : never;

export type OrbiSeverityFromRoute<T extends OrbiRoute> = T extends `${string}/${string}/${string}/${infer S}/${string}`
  ? S extends OrbiSeverity
    ? S
    : 'info'
  : 'info';

export type OrbiRouteProfile<T extends OrbiRoute = OrbiRoute> = {
  readonly route: T;
  readonly parts: OrbiRouteParts<T>;
  readonly domain: OrbiRouteParts<T>[0];
  readonly verb: OrbiRouteParts<T>[1];
  readonly cluster: OrbiRouteParts<T>[2];
  readonly severity: OrbiRouteParts<T>[3];
  readonly tag: OrbiRouteParts<T>[4];
  readonly canonical: T;
  readonly routeScore: RouteSeverityBucket<OrbiSeverityFromRoute<T>>;
  readonly normalized: {
    readonly domainClass: RouteDomainShiftClass<OrbiRouteParts<T>[0]>;
    readonly mode: NormalizeRouteVerb<OrbiRouteParts<T>[1]>;
  };
  readonly tags: readonly [
    `route-${OrbiRouteParts<T>[0]}`,
    `verb-${OrbiRouteParts<T>[1]}`,
    `cluster-${OrbiRouteParts<T>[2]}`,
    `severity-${OrbiRouteParts<T>[3]}`,
  ];
};

export type OrbiRoutePartTokens<T extends OrbiRoute> =
  T extends `/${infer D}/${infer V}/${infer C}/${infer S}/${infer I}`
    ? { domain: D; verb: V; cluster: C; severity: S; tag: I }
    : never;

type TupleIndex<T extends readonly unknown[]> = Exclude<keyof T, keyof []> & number;

export type OrbiRouteLookup<T extends readonly OrbiRoute[]> = {
  [K in TupleIndex<T> as `slot:${K}`]: OrbiRouteProfile<T[K]>;
};

export type OrbiResolvedPayload<T extends readonly OrbiRoute[]> = {
  [K in TupleIndex<T>]: OrbiRouteProfile<T[K]>;
};

export type OrbiRouteCatalog<T extends readonly OrbiRoute[]> = {
  readonly routes: T;
  readonly payload: OrbiResolvedPayload<T>;
  readonly lookup: OrbiRouteLookup<T>;
};

export type RouteMap<T extends Record<string, OrbiRoute>> = {
  [K in keyof T as K extends string ? `orbi:${K}` : never]: T[K] extends OrbiRoute ? OrbiRouteProfile<T[K]> : never;
};

export type BuildTuple<T extends number, Seed extends unknown[] = []> = Seed['length'] extends T
  ? Seed
  : BuildTuple<T, [...Seed, unknown]>;

export type Decrement<T extends number> = BuildTuple<T> extends [unknown, ...infer Rest] ? Rest['length'] : 0;

export type RouteTake<
  T extends readonly OrbiRoute[],
  N extends number,
  Acc extends readonly OrbiRoute[] = [],
> = N extends 0
  ? Acc
  : T extends readonly [infer Head, ...infer Tail]
    ? Tail extends readonly OrbiRoute[]
      ? RouteTake<Tail, Decrement<N>, [...Acc, Head & OrbiRoute]>
      : Acc
    : Acc;

export type RouteTail<T extends readonly OrbiRoute[]> =
  T extends readonly [unknown, ...infer Rest extends OrbiRoute[]] ? Rest : readonly [];

export type RouteChain<T extends OrbiRoute, N extends number = 4, Acc extends string[] = []> =
  Acc['length'] extends N ? Acc : RouteChain<T, N, [...Acc, `${T}/${Acc['length']}`]>;

type RouteProfileRemap<T extends Record<string, OrbiRoute>> = {
  [K in keyof T as K extends string ? `key-${Lowercase<K & string>}` : never]: {
    readonly source: K;
    readonly route: T[K];
    readonly routeParts: OrbiRouteParts<T[K]>;
  };
};

export const catalogLabelMap = (() => {
  const base: Record<string, OrbiRoute> = Object.fromEntries(
    orbiCatalogSource.map((route, index) => [`route_${index}`, route]),
  ) as Record<string, OrbiRoute>;
  return base;
})();

export const orbiProfileCatalog = buildOrbiPayload(orbiCatalogSource);

const routeLabelPairs = orbiCatalogSource.map((route, index) => ({
  key: `route-${index}`,
  route,
  severity: parseSeverity(route),
})) as {
  readonly key: string;
  readonly route: OrbiRoute;
  readonly severity: OrbiSeverity;
}[];

function parseSeverity(route: string): OrbiSeverity {
  const parts = route.split('/')[4];
  return toSeverity(parts);
}

export type OrbiRouteMap = RouteProfileRemap<{
  primary: typeof orbiCatalogSource[0];
  secondary: typeof orbiCatalogSource[1];
  tertiary: typeof orbiCatalogSource[2];
  fallback: typeof orbiCatalogSource[3];
  reserve: typeof orbiCatalogSource[4];
}>;

export type OrbiRouteEnvelope<T extends OrbiRoute> = {
  readonly route: T;
  readonly parts: OrbiRouteParts<T>;
};

export type OrbiResolved<T extends readonly OrbiRoute[]> = {
  readonly payload: OrbiResolvedPayload<T>;
  readonly catalog: OrbiRouteCatalog<T>;
};

export const orbiRouteCatalog: OrbiRouteCatalog<typeof orbiCatalogSource> = {
  routes: orbiCatalogSource,
  payload: orbiProfileCatalog,
  lookup: orbiCatalogSource.reduce(
    (acc, route, index) => ({
      ...acc,
      [`slot:${index}`]: buildOrbiPayload([route])[0] as OrbiRouteProfile<OrbiRoute>,
    }),
    {} as OrbiRouteLookup<typeof orbiCatalogSource>,
  ),
};

export class OrbiRouteScope implements AsyncDisposable {
  #closed = false;
  readonly createdAt = Date.now();

  constructor(public readonly marker: string) {}

  [Symbol.dispose](): void {
    this.#closed = true;
  }

  [Symbol.asyncDispose](): Promise<void> {
    this.#closed = true;
    return Promise.resolve();
  }
}

export const withOrbiRouteScope = <TResult>(work: (scope: OrbiRouteScope) => TResult): TResult => {
  using scope = new OrbiRouteScope('orion-route');
  return work(scope);
};

export const withOrbiRouteScopeAsync = async <TResult>(
  work: (scope: OrbiRouteScope) => Promise<TResult>,
): Promise<TResult> => {
  using scope = new OrbiRouteScope('orion-route-async');
  return work(scope);
};

export const orbiRouteSeed: OrbiRoute = orbiRouteCatalog.routes[0] ?? orbiCatalogSource[0];
export const orbiRouteCount = orbiCatalogSource.length;

type RouteDomainShift<T extends OrbiDomain> = RouteDomainShiftClass<T>;

type RouteVerbMode<T extends OrbiVerb> = T extends 'compose'
  ? 'ingest'
  : T extends 'simulate'
    ? 'dry-run'
    : T extends 'verify'
      ? 'validation'
      : T extends 'reconcile'
        ? 'merge'
        : T extends 'observe'
          ? 'monitor'
          : T extends 'drill'
            ? 'exertion'
            : T extends 'dispatch'
              ? 'issue'
              : T extends 'archive'
                ? 'store'
                : T extends 'route'
                  ? 'route'
                  : T extends 'synchronize'
                    ? 'sync'
                    : T extends 'replay'
                      ? 'rerun'
                      : T extends 'recovery'
                        ? 'recover'
                        : 'audit';

type SeverityProfile = {
  readonly [K in OrbiSeverity]: {
    readonly score: RouteSeverityBucket<K>;
    readonly className: K extends 'critical' | 'high' ? 'critical' : 'non-critical';
  };
};

const routeDomainShiftMap: Record<OrbiDomain, RouteDomainShift<OrbiDomain>> = {
  incident: 'ops',
  workflow: 'flow',
  fabric: 'net',
  policy: 'policy',
  telemetry: 'telemetry',
  safety: 'safety',
  recovery: 'recovery',
  analytics: 'analytics',
  drill: 'drill',
  audit: 'audit',
  continuity: 'continuity',
  resilience: 'resilience',
  mesh: 'mesh',
  orchestration: 'orchestration',
  timeline: 'timeline',
  command: 'command',
  signal: 'signal',
  runtime: 'runtime',
  intelligence: 'intelligence',
  strategy: 'strategy',
  portfolio: 'portfolio',
};

const routeModeMap: { readonly [K in OrbiVerb]: RouteVerbMode<K> } = {
  compose: 'ingest',
  simulate: 'dry-run',
  verify: 'validation',
  reconcile: 'merge',
  observe: 'monitor',
  drill: 'exertion',
  dispatch: 'issue',
  archive: 'store',
  route: 'route',
  synchronize: 'sync',
  replay: 'rerun',
  recovery: 'recover',
  audit: 'audit',
};

const severityProfile: SeverityProfile = {
  critical: { score: 5, className: 'critical' },
  high: { score: 4, className: 'critical' },
  medium: { score: 3, className: 'non-critical' },
  low: { score: 2, className: 'non-critical' },
  maintenance: { score: 1, className: 'non-critical' },
  info: { score: 0, className: 'non-critical' },
};

const toSeverity = (value: string): OrbiSeverity =>
  (value === 'critical' || value === 'high' || value === 'medium' || value === 'low' || value === 'maintenance' || value === 'info')
    ? value
    : 'info';

export function buildOrbiPayload<T extends readonly OrbiRoute[]>(routes: T): {
  [K in keyof T]: T[K] extends OrbiRoute ? OrbiRouteProfile<T[K]> : never;
} {
  return routes.map((route) => {
    const parts = route.split('/');
    const domain = parts[1] as OrbiDomain;
    const verb = parts[2] as OrbiVerb;
    const cluster = parts[3] as OrbiCluster;
    const severity = parseSeverity(route);
    const tag = (parts[5] ?? 'tag-0') as OrbiTag;
    const routeTuple = [domain, verb, cluster, severity, tag] as unknown as OrbiRouteParts<OrbiRoute>;
    const profile = {
      route,
      parts: routeTuple,
      domain,
      verb,
      cluster,
      severity,
      tag,
      canonical: route,
      routeScore: severityProfile[severity].score,
      normalized: {
        domainClass: routeDomainShiftMap[domain as OrbiDomain],
        mode: routeModeMap[verb as OrbiVerb],
      },
      tags: [
        `route-${parts[1] ?? 'unknown'}`,
        `verb-${parts[2] ?? 'compose'}`,
        `cluster-${parts[3] ?? 'atlas'}`,
        `severity-${parts[4] ?? 'info'}`,
      ],
    } as unknown as OrbiRouteProfile<OrbiRoute>;

    return profile as unknown as OrbiRouteProfile<T[number]>;
  }) as {
    [K in keyof T]: T[K] extends OrbiRoute ? OrbiRouteProfile<T[K]> : never;
  };
}

export type PathIndex = ReturnType<typeof buildOrbiPayload<typeof orbiCatalogSource>>;
