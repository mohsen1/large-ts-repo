export type RouteDomain =
  | 'agent'
  | 'artifact'
  | 'auth'
  | 'autoscaler'
  | 'build'
  | 'catalog'
  | 'cache'
  | 'cluster'
  | 'command'
  | 'compute'
  | 'connector'
  | 'config'
  | 'dashboard'
  | 'disaster'
  | 'dispatch'
  | 'edge'
  | 'fabric'
  | 'fleet'
  | 'graph'
  | 'identity'
  | 'incident'
  | 'lifecycle'
  | 'mesh'
  | 'control'
  | 'orchestrator'
  | 'policy'
  | 'recovery'
  | 'signal'
  | 'stream'
  | 'topology'
  | 'telemetry';

export type RouteAction =
  | 'admit'
  | 'audit'
  | 'build'
  | 'deploy'
  | 'dispatch'
  | 'drain'
  | 'drill'
  | 'emit'
  | 'execute'
  | 'heal'
  | 'inspect'
  | 'observe'
  | 'orchestrate'
  | 'plan'
  | 'query'
  | 'repair'
  | 'replay'
  | 'route'
  | 'run'
  | 'simulate'
  | 'sync'
  | 'validate';

export type RouteState = 'created' | 'enqueued' | 'running' | 'paused' | 'throttled' | 'finished' | 'failed' | 'abandoned';

export type RouteId = string;
export type OrchestratorRoute = string;

export type ResolvePriority<D extends RouteDomain> = D extends
  | 'incident'
  | 'recovery'
  | 'policy'
  | 'command'
  ? 'critical'
  : D extends 'fleet' | 'fabric' | 'control'
    ? 'high'
    : D extends 'stream' | 'telemetry' | 'signal'
      ? 'medium'
      : 'normal';

export type ResolveAction<A extends RouteAction> = A extends 'admit' | 'deploy'
  ? { readonly mutation: 'async'; readonly canRetry: true; readonly window: 'control' }
  : A extends 'audit' | 'validate' | 'inspect'
    ? { readonly mutation: 'audit'; readonly canRetry: false; readonly window: 'analysis' }
    : A extends 'sync' | 'route' | 'dispatch'
      ? { readonly mutation: 'io'; readonly canRetry: true; readonly window: 'integration' }
      : A extends 'heal' | 'repair' | 'run' | 'simulate'
        ? { readonly mutation: 'execution'; readonly canRetry: true; readonly window: 'workload' }
        : { readonly mutation: 'read'; readonly canRetry: false; readonly window: 'default' };

export type ResolveState<S extends RouteState> = S extends 'created' | 'enqueued'
  ? { readonly canCancel: true; readonly terminal: false }
  : S extends 'running'
    ? { readonly canCancel: true; readonly terminal: false; readonly requiresAudit: true }
    : S extends 'paused' | 'throttled'
      ? { readonly canCancel: true; readonly terminal: false; readonly restartable: true }
      : { readonly canCancel: false; readonly terminal: true };

export type RouteEnvelope<T extends OrchestratorRoute> = T extends `${infer TDomain}/${infer TVerb}/${infer TStatus}/${infer TContext}`
  ? {
      readonly route: T;
      readonly domain: TDomain & RouteDomain;
      readonly action: TVerb & RouteAction;
      readonly state: TStatus & RouteState;
      readonly id: TContext;
      readonly priority: ResolvePriority<TDomain & RouteDomain>;
      readonly actionProfile: ResolveAction<TVerb & RouteAction>;
      readonly stateProfile: ResolveState<TStatus & RouteState>;
      readonly raw: T;
      readonly checksum: `crc:${number}`;
      readonly labels: readonly [TDomain & string, TVerb & string, TStatus & string, TContext & string];
    }
  : {
      readonly route: T;
      readonly domain: RouteDomain;
      readonly action: RouteAction;
      readonly state: RouteState;
      readonly id: RouteId;
      readonly priority: ResolvePriority<RouteDomain>;
      readonly actionProfile: ResolveAction<RouteAction>;
      readonly stateProfile: ResolveState<RouteState>;
      readonly raw: T;
      readonly checksum: `crc:${number}`;
      readonly labels: readonly [string, string, string];
    };

export type RouteEnvelopeByState<T extends OrchestratorRoute> = RouteEnvelope<T> & {
  readonly runtime: { readonly observedAt: number; readonly tags: readonly string[] };
};

export type RouteUnionEnvelope<T extends readonly OrchestratorRoute[]> = {
  [K in keyof T]: T[K] extends OrchestratorRoute ? RouteEnvelopeByState<T[K]> : never;
};

export type ChainResolve<T extends OrchestratorRoute> = {
  readonly route: T;
  readonly domain: RouteDomain;
  readonly mutation: ResolveAction<RouteAction>['mutation'];
  readonly priority: ResolvePriority<RouteDomain>;
  readonly resolved: true;
};

export type DistinctResolved<T extends OrchestratorRoute> = ChainResolve<T> & {
  readonly domainHint: RouteDomain;
  readonly actionHint: RouteAction;
  readonly stateHint: RouteState;
  readonly idHint: RouteId;
};

export type RouteDiscriminator<T extends OrchestratorRoute> = {
  readonly priority: DistinctResolved<T>['priority'];
  readonly mutation: DistinctResolved<T>['mutation'];
  readonly routeFamily: `fam-${DistinctResolved<T>['priority'] & string}`;
};

export type RouteRemap<T extends Record<string, OrchestratorRoute>> = {
  [K in keyof T as K & string]: RouteUnionEnvelope<[T[K]]>[0];
};

export type ResolvedRouteKeys<T extends readonly OrchestratorRoute[]> = {
  [K in keyof T]: T[K] extends OrchestratorRoute ? `resolved/${K & string}/${RouteState}` : never;
}[number];

export type RouteFamily<T extends readonly OrchestratorRoute[]> = {
  [K in keyof T]: T[K] extends OrchestratorRoute ? RouteDiscriminator<T[K]> : never;
}[number];

export type RoutePipeline<T extends readonly OrchestratorRoute[]> = {
  readonly routeFamily: RouteFamily<T>;
  readonly routeLabels: ResolvedRouteKeys<T>;
  readonly map: RouteRemap<Record<string, T[number]>>;
};

export type RouteMapInput = Record<string, OrchestratorRoute>;

export const sampleCatalog = {
  incidentRun: 'incident/run/running/abcd-efghi-jklmnopq',
  recoverySim: 'recovery/simulate/enqueued/wxyz-uvwxy-qrstuvwx',
  policyAudit: 'policy/audit/created/zzzz-yyyyy-xxxxxxxx',
  signalSync: 'signal/sync/running/aa11a-bb222-cccccccc',
  meshRoute: 'mesh/dispatch/running/route-1111-bcdedefg',
  topologyObserve: 'topology/observe/running/topo-2222-efghijkl',
  telemetryDrain: 'telemetry/drain/paused/tele-3333-bcdefgh1',
  connectorDispatch: 'connector/dispatch/created/conn-4444-defghijk',
  edgeHeal: 'edge/heal/failed/edge-5555-ghijklmn',
  fabricRepair: 'fabric/repair/finished/fabr-6666-hijklmnop',
} as const satisfies Record<string, OrchestratorRoute>;

export type RouteTemplateMap<T extends OrchestratorRoute[]> = {
  [I in keyof T as `route-${I & string}`]: T[I] extends OrchestratorRoute ? RouteEnvelope<I & string & OrchestratorRoute> : never;
};

type RouteEnvelopeCatalogTuple<T extends readonly OrchestratorRoute[]> = {
  [K in keyof T]: T[K] extends OrchestratorRoute ? RouteEnvelopeByState<T[K]> : never;
};

export const buildRouteEnvelopeCatalog = <const T extends readonly [OrchestratorRoute, ...OrchestratorRoute[]]>(
  routes: T,
): RouteUnionEnvelope<T> => {
  const out: RouteEnvelopeByState<T[number]>[] = [];
  for (const route of routes) {
    const [domain, action, state, id] = route.split('/');
    out.push({
      route,
      domain: domain as RouteDomain,
      action: action as RouteAction,
      state: (state ?? 'running') as RouteState,
      id: (id ?? 'unknown-0000') as RouteId,
      priority: resolvePriorityFromDomain(domain as RouteDomain),
      actionProfile: {
        mutation: action === 'run' || action === 'simulate' || action === 'heal' || action === 'repair'
          ? 'execution'
          : action === 'admit' || action === 'deploy'
            ? 'async'
            : action === 'audit' || action === 'validate'
              ? 'audit'
              : action === 'dispatch' || action === 'sync' || action === 'route'
                ? 'io'
                : 'read',
        canRetry: action === 'run' || action === 'simulate' || action === 'heal' || action === 'repair' || action === 'dispatch' || action === 'sync',
        window: action === 'run' || action === 'simulate' || action === 'repair' || action === 'heal'
          ? 'workload'
          : action === 'sync' || action === 'route'
            ? 'integration'
            : action === 'audit' || action === 'validate'
              ? 'analysis'
              : action === 'admit' || action === 'deploy'
                ? 'control'
                : 'default',
      } as ResolveAction<RouteAction & string>,
      stateProfile: state === 'running' || state === 'created' || state === 'enqueued'
        ? { canCancel: true, terminal: false }
        : state === 'paused' || state === 'throttled'
          ? { canCancel: true, terminal: false, restartable: true }
          : { canCancel: false, terminal: true },
      raw: route,
      checksum: `crc:${route.length}`,
      labels: [domain, action, state],
      runtime: { observedAt: Date.now(), tags: ['orchestrated', action] },
    } as unknown as RouteEnvelopeByState<T[number]>);
  }
  return out as unknown as RouteUnionEnvelope<T>;
};

export const broadConditionalPipeline = <T extends OrchestratorRoute>(route: T): ChainResolve<T> => {
  const [domain, action] = route.split('/');
  return {
    route,
    domain: resolveDomainFromContext(domain),
    mutation: (action === 'run' || action === 'simulate' || action === 'heal' || action === 'repair'
      ? 'execution'
      : action === 'admit' || action === 'deploy'
        ? 'async'
        : action === 'audit' || action === 'validate'
          ? 'audit'
          : action === 'dispatch' || action === 'sync' || action === 'route'
            ? 'io'
            : 'read') as ChainResolve<T>['mutation'],
    priority: resolvePriorityFromDomain(resolveDomainFromContext(domain)),
    resolved: true,
  };
};

export const routeCatalogEnvelope = <const T extends readonly [OrchestratorRoute, ...OrchestratorRoute[]]>(
  routes: T,
): RouteUnionEnvelope<T> => buildRouteEnvelopeCatalog(routes);

const sampleRouteValues = [
  sampleCatalog.incidentRun,
  sampleCatalog.recoverySim,
  sampleCatalog.policyAudit,
  sampleCatalog.signalSync,
  sampleCatalog.meshRoute,
  sampleCatalog.topologyObserve,
  sampleCatalog.telemetryDrain,
  sampleCatalog.connectorDispatch,
  sampleCatalog.edgeHeal,
  sampleCatalog.fabricRepair,
] as const;
export const sampleRouteCatalog = buildRouteEnvelopeCatalog(sampleRouteValues);

function resolvePriorityFromDomain(domain: RouteDomain): 'critical' | 'high' | 'medium' | 'normal' {
  return domain === 'incident' || domain === 'recovery' || domain === 'policy' || domain === 'command'
    ? 'critical'
    : domain === 'fleet' || domain === 'fabric' || domain === 'control'
      ? 'high'
      : domain === 'stream' || domain === 'telemetry' || domain === 'signal'
        ? 'medium'
        : 'normal';
}

function resolveDomainFromContext(domain: string): RouteDomain {
  const value = domain as RouteDomain;
  return value;
}

export type RoutePipelineSample = RoutePipeline<readonly [OrchestratorRoute]>;

export type RouteUnionEnvelopeAlias = RouteUnionEnvelope<[OrchestratorRoute]>;
