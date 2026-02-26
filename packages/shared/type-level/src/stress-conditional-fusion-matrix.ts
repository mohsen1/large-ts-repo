export type DomainToken =
  | 'atlas'
  | 'mesh'
  | 'ops'
  | 'lattice'
  | 'telemetry'
  | 'policy'
  | 'signal'
  | 'resilience'
  | 'safety'
  | 'governance'
  | 'forecast';

export type ActionToken =
  | 'bootstrap'
  | 'simulate'
  | 'stabilize'
  | 'restore'
  | 'heal'
  | 'prewarm'
  | 'scan'
  | 'throttle'
  | 'drain'
  | 'quarantine'
  | 'contain'
  | 'dispatch'
  | 'suspend'
  | 'resume'
  | 'rewire'
  | 'relink'
  | 'snapshot'
  | 'rollback'
  | 'commit'
  | 'observe'
  | 'route'
  | 'drill'
  | 'verify'
  | 'signal'
  | 'enforce'
  | 'defend';

export type EntityToken =
  | 'node'
  | 'edge'
  | 'zone'
  | 'tenant'
  | 'session'
  | 'inventory'
  | 'playbook'
  | 'incident'
  | 'workflow'
  | 'channel'
  | 'saga'
  | 'ledger'
  | 'manifest'
  | 'operator'
  | 'metric';

export type FusionRoute = `${DomainToken}/${ActionToken}/${EntityToken}`;
export type RouteTuple = readonly [DomainToken, ActionToken, EntityToken];

export type SplitRoute<T extends FusionRoute> =
  T extends `${infer D}/${infer A}/${infer E}`
    ? [D, A, E]
    : never;

export type RouteActionClass<Action extends string> =
  Action extends 'bootstrap' ? 'control'
    : Action extends 'simulate' ? 'analysis'
      : Action extends 'stabilize' ? 'control'
        : Action extends 'restore' ? 'recovery'
          : Action extends 'heal' ? 'recovery'
            : Action extends 'prewarm' ? 'control'
              : Action extends 'scan' ? 'diagnostic'
                : Action extends 'throttle' ? 'policy'
                  : Action extends 'drain' ? 'quarantine'
                    : Action extends 'quarantine' ? 'quarantine'
                      : Action extends 'contain' ? 'quarantine'
                        : Action extends 'dispatch' ? 'execution'
                          : Action extends 'suspend' ? 'execution'
                            : Action extends 'resume' ? 'execution'
                              : Action extends 'rewire' ? 'remediation'
                                : Action extends 'relink' ? 'remediation'
                                  : Action extends 'snapshot' ? 'safeguard'
                                    : Action extends 'rollback' ? 'recovery'
                                      : Action extends 'commit' ? 'policy'
                                        : Action extends 'observe' ? 'observation'
                                          : Action extends 'route' ? 'routing'
                                            : Action extends 'drill' ? 'simulation'
                                              : Action extends 'verify' ? 'diagnostic'
                                                : Action extends 'signal' ? 'telemetry'
                                                  : Action extends 'enforce' ? 'policy'
                                                    : Action extends 'defend' ? 'security'
                                                    : 'unknown';

export type RouteVerbPriority<Action extends string> =
  Action extends 'bootstrap' ? 100
    : Action extends 'simulate' ? 90
      : Action extends 'stabilize' ? 85
        : Action extends 'restore' ? 95
          : Action extends 'heal' ? 90
            : Action extends 'drain' ? 70
              : Action extends 'quarantine' ? 88
                : Action extends 'dispatch' ? 75
                  : Action extends 'suspend' ? 60
                    : Action extends 'resume' ? 62
                      : Action extends 'rollback' ? 92
                        : Action extends 'commit' ? 80
                          : Action extends 'observe' ? 50
                            : Action extends 'route' ? 60
                              : Action extends 'drill' ? 86
                                : Action extends 'verify' ? 52
                                  : Action extends 'signal' ? 54
                                    : Action extends 'enforce' ? 76
                                      : Action extends 'defend' ? 89
                                        : 1;

export type RouteSeverity<Action extends string> = RouteVerbPriority<Action> extends infer P extends number
  ? P extends 90 | 95
    ? 'critical'
    : P extends 80 | 86 | 89
      ? 'high'
      : P extends 75 | 70 | 76
        ? 'medium'
        : 'low'
  : 'low';

export type RouteResolver<Route extends FusionRoute> =
  Route extends `${infer Domain}/${infer Action}/${infer Entity}`
    ? Domain extends DomainToken
      ? Action extends ActionToken
        ? Entity extends EntityToken
          ? {
              readonly domain: Domain;
              readonly action: Action;
              readonly entity: Entity;
              readonly raw: Route;
              readonly actionClass: RouteActionClass<Action>;
              readonly severity: RouteSeverity<Action>;
              readonly score: RouteVerbPriority<Action>;
            }
          : never
        : never
      : never
    : never;

type RouteResolverPlaneByClass<Kind extends string> =
  Kind extends 'control'
    ? { readonly controlPlane: true }
    : Kind extends 'analysis'
      ? { readonly analysisPlane: true }
      : Kind extends 'recovery'
        ? { readonly recoveryPlane: true }
        : Kind extends 'diagnostic'
          ? { readonly diagnosticPlane: true }
          : Kind extends 'policy'
            ? { readonly policyPlane: true }
            : Kind extends 'quarantine'
              ? { readonly quarantinePlane: true }
              : Kind extends 'execution'
                ? { readonly executionPlane: true }
                : Kind extends 'remediation'
                  ? { readonly remediationPlane: true }
                  : Kind extends 'observation'
                    ? { readonly observationPlane: true }
                    : Kind extends 'routing'
                      ? { readonly routingPlane: true }
                      : Kind extends 'simulation'
                        ? { readonly simulationPlane: true }
                        : Kind extends 'telemetry'
                          ? { readonly telemetryPlane: true }
                          : Kind extends 'security'
                            ? { readonly securityPlane: true }
                            : { readonly genericPlane: true };

export type RouteResolverByClass<Route extends FusionRoute> =
  RouteResolver<Route> extends { actionClass: infer Kind extends string }
    ? RouteResolverPlaneByClass<Kind>
    : { readonly genericPlane: true };

export type ResolveFusionRoute<Route extends FusionRoute> =
  RouteResolver<Route> & RouteResolverByClass<Route>;

export type ResolveFusionRouteChain<Routes extends readonly FusionRoute[]> =
  Routes extends readonly [infer Head extends FusionRoute, ...infer Rest extends FusionRoute[]]
    ? [ResolveFusionRoute<Head>, ...ResolveFusionRouteChain<Rest>]
    : [];

export type DistinctAction<Routes extends readonly FusionRoute[]> = {
  [K in keyof Routes as K extends string ? `slot_${K}` : never]: Routes[K] extends FusionRoute ?
    SplitRoute<Routes[K]>[1] : never;
};

export type DispatchMatrix<Routes extends readonly FusionRoute[]> = {
  readonly index: Readonly<Record<string, number>>;
  readonly byDomain: {
    [K in DomainToken]?: ReadonlyArray<Extract<Routes[number], `${K}/${string}/${string}`>>;
  };
  readonly byAction: {
    [K in ActionToken]?: ReadonlyArray<Extract<Routes[number], `${string}/${K}/${string}`>>;
  };
};

export type BuildDispatchMatrix<Routes extends readonly FusionRoute[]> = Readonly<{
  readonly map: DistinctAction<Routes>;
  readonly rows: ResolveFusionRouteChain<Routes>;
}>;

export const allFusionRoutes = [
  'atlas/bootstrap/node',
  'atlas/simulate/node',
  'atlas/stabilize/edge',
  'ops/restore/node',
  'mesh/heal/node',
  'mesh/quarantine/session',
  'policy/scan/tenant',
  'telemetry/observe/metric',
  'signal/route/channel',
  'governance/signal/incident',
  'signal/drill/session',
  'resilience/contain/playbook',
  'ops/dispatch/workflow',
  'ops/suspend/session',
  'ops/resume/session',
  'policy/commit/node',
  'policy/verify/ledger',
  'signal/snapshot/manifest',
  'policy/enforce/workflow',
  'resilience/defend/saga',
  'atlas/rollback/playbook',
] as const satisfies readonly FusionRoute[];

export type MatrixInput = typeof allFusionRoutes;

export const routeSplit = (route: FusionRoute): RouteTuple => {
  const [domain, action, entity] = route.split('/') as [DomainToken, ActionToken, EntityToken];
  return [domain, action, entity];
};

export const classifyRoute = (route: FusionRoute) => {
  const resolved = routeResolver(route);
  const routeClass = routeClassLabel(resolved.actionClass);
  return {
    route,
    domain: resolved.domain,
    action: resolved.action,
    entity: resolved.entity,
    actionClass: resolved.actionClass,
    severity: resolved.severity,
    plane: routeClass,
  };
};

export const routeResolver = <T extends FusionRoute>(route: T): ResolveFusionRoute<T> => {
  const [domain, action, entity] = routeSplit(route);
  const actionClass = routeActionClass(action);
  const severity = routeSeverity(action);
  const score = routePriority(action);
  return {
    domain,
    action,
    entity,
    raw: route,
    actionClass,
    severity,
    score,
  } as unknown as ResolveFusionRoute<T>;
};

export const routeActionClass = <T extends string>(action: T): RouteActionClass<T> => {
  const map: Record<string, string> = {
    bootstrap: 'control',
    simulate: 'analysis',
    stabilize: 'control',
    restore: 'recovery',
    heal: 'recovery',
    prewarm: 'control',
    scan: 'diagnostic',
    throttle: 'policy',
    drain: 'quarantine',
    quarantine: 'quarantine',
    contain: 'quarantine',
    dispatch: 'execution',
    suspend: 'execution',
    resume: 'execution',
    rewire: 'remediation',
    relink: 'remediation',
    snapshot: 'safeguard',
    rollback: 'recovery',
    commit: 'policy',
    observe: 'observation',
    route: 'routing',
    drill: 'simulation',
    verify: 'diagnostic',
    signal: 'telemetry',
    enforce: 'policy',
    defend: 'security',
  };
  return (map[action] ?? 'diagnostic') as RouteActionClass<T>;
};

export const routePriority = (action: string): number =>
  (routeVerbPriority[action as ActionToken] ?? 1);

export const routeSeverity = (action: string): 'critical' | 'high' | 'medium' | 'low' => {
  const score = routePriority(action);
  if (score >= 90) return 'critical';
  if (score >= 80) return 'high';
  if (score >= 70) return 'medium';
  return 'low';
};

export const routeClassLabel = (cls: string): string => {
  switch (cls) {
    case 'control':
      return 'control-plane';
    case 'analysis':
      return 'analysis-plane';
    case 'recovery':
      return 'recovery-plane';
    case 'diagnostic':
      return 'diagnostic-plane';
    case 'policy':
      return 'policy-plane';
    case 'quarantine':
      return 'quarantine-plane';
    case 'execution':
      return 'execution-plane';
    case 'remediation':
      return 'remediation-plane';
    case 'observation':
      return 'observation-plane';
    case 'routing':
      return 'routing-plane';
    case 'simulation':
      return 'simulation-plane';
    case 'telemetry':
      return 'telemetry-plane';
    default:
      return 'generic-plane';
  }
};

export const routeVerbPriority: { [K in ActionToken]: number } = {
  bootstrap: 100,
  simulate: 90,
  stabilize: 85,
  restore: 95,
  heal: 90,
  prewarm: 72,
  scan: 62,
  throttle: 70,
  drain: 70,
  quarantine: 88,
  contain: 80,
  dispatch: 75,
  suspend: 60,
  resume: 62,
  rewire: 68,
  relink: 68,
  snapshot: 56,
  rollback: 92,
  commit: 80,
  observe: 50,
  route: 60,
  drill: 86,
  verify: 52,
  signal: 54,
  enforce: 76,
  defend: 89,
};
