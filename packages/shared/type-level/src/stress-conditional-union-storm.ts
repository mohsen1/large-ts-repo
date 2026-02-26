export type StormDomain =
  | 'incident'
  | 'workload'
  | 'continuity'
  | 'fabric'
  | 'timeline'
  | 'forecast'
  | 'saga'
  | 'readiness'
  | 'intelligence'
  | 'orchestrator'
  | 'command'
  | 'observability'
  | 'signal'
  | 'policy'
  | 'fabric-mesh'
  | 'chronicle'
  | 'runtime'
  | 'inventory'
  | 'risk'
  | 'governance'
  | 'atlas';

export type StormVerb =
  | 'discover'
  | 'assess'
  | 'repair'
  | 'recover'
  | 'route'
  | 'notify'
  | 'simulate'
  | 'archive'
  | 'verify'
  | 'rollback'
  | 'escalate'
  | 'stabilize'
  | 'quiesce';

export type StormSeverity =
  | 'low'
  | 'medium'
  | 'high'
  | 'critical'
  | 'catastrophic'
  | 'advisory';

export type StormId =
  | 'R01'
  | 'R02'
  | 'R03'
  | 'R04'
  | 'R05'
  | 'R06'
  | 'R07'
  | 'R08'
  | 'R09'
  | 'R10'
  | 'R11'
  | 'R12'
  | 'R13'
  | 'R14'
  | 'R15'
  | 'R-100'
  | 'R-101'
  | 'R-102'
  | 'R-103'
  | 'R-104'
  | 'R-105'
  | 'R-106'
  | 'R-107'
  | 'R-108'
  | 'R-109'
  | 'R-110';

export type StormRoute =
  | `/${StormDomain}/${StormVerb}/${StormSeverity}/${StormId}`
  | `/${StormDomain}/${StormVerb}/${StormSeverity}/${StormId}/dry`
  | `/${StormDomain}/${StormVerb}/${StormSeverity}/${StormId}/live`
  | `/${StormDomain}/${StormVerb}/${StormSeverity}/${StormId}/audit`
  | `/archive/${StormDomain}/${StormVerb}/${StormId}`;

export { runControlFlowVolcano, computeFlowDecision } from './stress-control-flow-volcano';

export type RouteChunk<T extends StormRoute> = T extends `/${infer A}/${infer B}/${infer C}/${infer D}`
  ? {
    readonly domain: A;
    readonly verb: B;
    readonly severity: C;
    readonly id: D;
  }
  : T extends `/${infer A}/${infer B}/${infer C}/${infer D}/${infer E}`
    ? {
      readonly domain: A;
      readonly verb: B;
      readonly severity: C;
      readonly id: D;
      readonly mode: E;
    }
    : T extends `/archive/${infer A}/${infer B}/${infer C}`
      ? {
        readonly domain: `archive-${A}`;
        readonly verb: B;
        readonly severity: C;
        readonly id: 'R00';
      }
      : never;

export type SeverityPolicy<T extends string> =
  T extends 'critical' ? { readonly escalation: 'critical'; readonly timeoutSec: 60 }
  : T extends 'catastrophic' ? { readonly escalation: 'catastrophic'; readonly timeoutSec: 120 }
  : T extends 'high' ? { readonly escalation: 'high'; readonly timeoutSec: 45 }
  : T extends 'medium' ? { readonly escalation: 'medium'; readonly timeoutSec: 30 }
  : T extends 'low' ? { readonly escalation: 'low'; readonly timeoutSec: 10 }
  : T extends 'advisory' ? { readonly escalation: 'advisory'; readonly timeoutSec: 5 }
  : never;

export type VerbProfile<T extends string> =
  T extends 'discover' ? { readonly verbTier: 1; readonly synchronous: false }
  : T extends 'assess' ? { readonly verbTier: 2; readonly synchronous: false }
  : T extends 'repair' ? { readonly verbTier: 3; readonly synchronous: true }
  : T extends 'recover' ? { readonly verbTier: 4; readonly synchronous: true }
  : T extends 'route' ? { readonly verbTier: 5; readonly synchronous: true }
  : T extends 'notify' ? { readonly verbTier: 6; readonly synchronous: false }
  : T extends 'simulate' ? { readonly verbTier: 7; readonly synchronous: false }
  : T extends 'archive' ? { readonly verbTier: 8; readonly synchronous: true }
  : T extends 'verify' ? { readonly verbTier: 9; readonly synchronous: false }
  : T extends 'rollback' ? { readonly verbTier: 10; readonly synchronous: true }
  : T extends 'escalate' ? { readonly verbTier: 11; readonly synchronous: true }
  : T extends 'stabilize' ? { readonly verbTier: 12; readonly synchronous: false }
  : T extends 'quiesce' ? { readonly verbTier: 13; readonly synchronous: true }
  : never;

export type Decrement<T extends number> = T extends 0 ? never : [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10][T];
export type RouteSignal<T extends StormRoute> = T extends `${string}/${infer D}/${infer V}/${infer S}/${infer I}`
  ? (`${Uppercase<string & D>}/${Uppercase<string & V>}:${Uppercase<string & S>}:${I & string}`)
  : T extends `/archive/${infer A}/${infer B}/${infer C}`
    ? (`ARCHIVE_${Uppercase<string & A>}_${Uppercase<string & B>}_${Uppercase<string & C>}`)
    : never;

type StormRouteSeed<T extends StormRoute> = T extends `/archive/${infer D}/${infer V}/${string}`
  ? `/archive/${string & D}/${string & V}/${string}`
  : T extends `/${infer D}/${infer V}/${infer S}/${infer _I}`
    ? `/${string & D}/${string & V}/${string & S}/${string}`
    : never;

export type RouteResolutionProfile<T extends StormRoute> = T extends infer U extends StormRoute
  ? RouteChunk<U> extends never
    ? never
    : RouteChunk<U> extends infer Parsed
      ? Parsed extends { readonly domain: infer D; readonly verb: infer V; readonly severity: infer S; readonly id: infer I }
        ? ({
          readonly domain: D;
          readonly verb: V;
          readonly severity: S;
          readonly id: I;
          readonly signal: RouteSignal<U>;
          readonly policy: D extends string
            ? SeverityPolicy<S & string>
            : never;
          readonly verbProfile: V extends string
            ? VerbProfile<V>
            : never;
        } & {
          readonly route: U;
        })
        : never
      : never
  : never;

export type RouteResolutionChain<T extends StormRoute> = RouteResolutionProfile<T>;

export type StormRouteIndex<T extends StormRoute> =
  T extends `${infer D}/${infer _V}/${infer _S}/${infer _I}`
    ? D
    : 'unknown';

export const defaultStormCatalog = [
  '/incident/discover/high/R01',
  '/incident/assess/critical/R02',
  '/workload/repair/low/R03/live',
  '/workload/simulate/medium/R04',
  '/fabric/rollback/high/R05',
  '/fabric/route/advisory/R06',
  '/timeline/verify/low/R07',
  '/signal/archive/critical/R08',
  '/policy/stabilize/high/R09',
  '/orchestrator/quiesce/medium/R10',
] as const satisfies readonly StormRoute[];

export type StormDistributiveResolution<TRoutes extends StormRoute> = RouteResolutionProfile<TRoutes>;

export type StormRouteProjection<T extends StormRoute> = {
  readonly route: T;
  readonly domain: RouteChunk<T>['domain'];
  readonly verb: RouteChunk<T>['verb'];
  readonly severity: RouteChunk<T>['severity'];
  readonly id: RouteChunk<T>['id'];
  readonly routeSignal: RouteSignal<T>;
};

export const normalizeStormRoute = <T extends StormRoute>(route: T): StormRouteProjection<T> => {
  const [empty, domain, verb, severity, id] = route.split('/') as [string, ...string[]];
  void empty;
  return {
    route,
    domain,
    verb,
    severity,
    id,
    routeSignal: `${domain.toUpperCase()}/${verb.toUpperCase()}:${severity.toUpperCase()}:${id}` as RouteSignal<T>,
  } as StormRouteProjection<T>;
};

export type RouteProjection<T extends StormRoute> = StormRouteProjection<T>;

export const routeSignalCatalog = defaultStormCatalog.map((route) => normalizeStormRoute(route)) as readonly StormRouteProjection<StormRoute>[];
