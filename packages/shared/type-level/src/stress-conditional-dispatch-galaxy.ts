export type EntityName =
  | 'incident'
  | 'fabric'
  | 'mesh'
  | 'horizon'
  | 'timeline'
  | 'chronicle'
  | 'drill'
  | 'playbook'
  | 'policy'
  | 'telemetry'
  | 'registry'
  | 'scheduler'
  | 'orchestrator'
  | 'signal'
  | 'forecast'
  | 'observer'
  | 'workflow'
  | 'artifact'
  | 'snapshot'
  | 'journal'
  | 'replay'
  | 'adapter'
  | 'connector'
  | 'gateway'
  | 'resolver'
  | 'command';

export type WorkAction =
  | 'discover'
  | 'assess'
  | 'simulate'
  | 'mitigate'
  | 'rollback'
  | 'restore'
  | 'drain'
  | 'safeguard'
  | 'isolate'
  | 'repair'
  | 'verify'
  | 'report'
  | 'notify'
  | 'archive';

export type WorkSeverity =
  | 'critical'
  | 'high'
  | 'medium'
  | 'low'
  | 'info'
  | 'warning'
  | 'resolved'
  | 'suspended';

export type WorkId = `id-${string}`;

export type WorkPath = `/${WorkAction}/${EntityName}/${WorkSeverity}/${WorkId}`;

export type RawRoute =
  | `/${WorkAction}/incident/${WorkSeverity}/${WorkId}`
  | `/${WorkAction}/fabric/${WorkSeverity}/${WorkId}`
  | `/${WorkAction}/mesh/${WorkSeverity}/${WorkId}`
  | `/${WorkAction}/horizon/${WorkSeverity}/${WorkId}`
  | `/${WorkAction}/timeline/${WorkSeverity}/${WorkId}`
  | `/${WorkAction}/chronicle/${WorkSeverity}/${WorkId}`
  | `/${WorkAction}/drill/${WorkSeverity}/${WorkId}`
  | `/${WorkAction}/playbook/${WorkSeverity}/${WorkId}`
  | `/${WorkAction}/policy/${WorkSeverity}/${WorkId}`
  | `/${WorkAction}/telemetry/${WorkSeverity}/${WorkId}`
  | `/${WorkAction}/registry/${WorkSeverity}/${WorkId}`
  | `/${WorkAction}/scheduler/${WorkSeverity}/${WorkId}`
  | `/${WorkAction}/orchestrator/${WorkSeverity}/${WorkId}`
  | `/${WorkAction}/signal/${WorkSeverity}/${WorkId}`
  | `/${WorkAction}/forecast/${WorkSeverity}/${WorkId}`
  | `/${WorkAction}/observer/${WorkSeverity}/${WorkId}`
  | `/${WorkAction}/workflow/${WorkSeverity}/${WorkId}`
  | `/${WorkAction}/artifact/${WorkSeverity}/${WorkId}`
  | `/${WorkAction}/snapshot/${WorkSeverity}/${WorkId}`
  | `/${WorkAction}/journal/${WorkSeverity}/${WorkId}`
  | `/${WorkAction}/replay/${WorkSeverity}/${WorkId}`;

export type RouteAction<T extends RawRoute = RawRoute> = T extends RawRoute ? string : never;
export type RouteEntity<T extends RawRoute = RawRoute> = T extends RawRoute ? string : never;
export type RouteSeverity<T extends RawRoute = RawRoute> = T extends RawRoute ? string : never;
export type RouteId<T extends RawRoute = RawRoute> = T extends RawRoute ? string : never;

export type RouteTuple<T extends RawRoute> = [RouteAction<T>, RouteEntity<T>, RouteSeverity<T>, RouteId<T>];

export type RouteMap<T extends string> = T extends RawRoute
  ? { action: string; entity: string; severity: string; id: string }
  : { action: string; entity: string; severity: string; id: string };

export type NestedRouteMap<T extends readonly RawRoute[]> = {
  [K in keyof T]: T[K] extends RawRoute ? RouteMap<T[K] & string> : never;
};

export type ResolveEntityAction<A extends RawRoute> = RouteEntity<A> extends infer E
  ? E extends string
    ? string
    : never
  : never;

type DeepPhase<TAction extends string, TEntity extends string, TSeverity extends string> = TAction extends 'discover'
  ? TSeverity extends 'critical'
    ? 'detection'
    : 'generic'
  : TAction extends 'rollback'
    ? 'rollback-default'
    : 'generic';

export type DeepChain<T extends RawRoute> = T extends `/${infer A}/${infer B}/${infer C}/${infer D}`
  ? {
      kind: A;
      target: B;
      scope: C;
      id: D;
      phase: DeepPhase<A & string, B & string, C & string>;
      next: `/${A}/${B}/${C}/${D}`;
    }
  : never;

export type DistributiveResolution<T extends string> = T extends RawRoute ? T : T;
export type RouteDiscriminant<T extends RawRoute> = string;

export type ResolveDispatch<T extends RawRoute> = DistributiveResolution<T> extends infer M
  ? {
      readonly key: string;
      readonly normalized: string;
    }
  : never;

export type ChainThen<T extends RawRoute> = ResolveDispatch<T> extends infer R
  ? R extends { key: infer K; normalized: infer N }
    ? { readonly key: K; readonly normalized: N; readonly resolved: ResolveDispatch<T> }
    : never
  : never;

export type RoutedTupleFromUnion<T extends readonly RawRoute[]> = {
  [K in keyof T]: T[K] extends RawRoute ? string : never;
};

export type NormalizeRoute<T extends string> = T extends RawRoute
  ? Lowercase<T>
  : never;

export type ExpandTemplateKeys<T extends Record<string, unknown>> = {
  [K in keyof T & string]: T[K];
};

export type NestedMapValues<T extends Record<string, unknown>> = {
  readonly [K in keyof T]: T[K] extends readonly (infer U)[]
    ? ReadonlyArray<U>
    : T[K] extends Record<string, unknown>
      ? Record<string, unknown>
      : T[K];
};

export type KeyRemapTemplate<T extends Record<string, unknown>> = {
  [K in keyof T as `input:${K & string}`]: T[K] extends Record<string, unknown> ? NestedMapValues<T[K]> : T[K];
};

export type TemplateAccumulator<T extends Record<string, unknown>> = {
  readonly entries: KeyRemapTemplate<T>;
  readonly flattened: NestedMapValues<T>;
};

export type RouteCatalog = {
  discover: WorkPath[];
  assess: WorkPath[];
  simulate: WorkPath[];
  rollback: WorkPath[];
  notify: WorkPath[];
  archive: WorkPath[];
};

export type RouteCatalogEntries = string;
export type RouteCatalogByAction<T extends WorkAction> = T extends WorkAction ? readonly WorkPath[] : never;

export const galaxyCatalog = {
  discover: [
    '/discover/incident/critical/id-alpha',
    '/discover/incident/high/id-bravo',
    '/discover/fabric/medium/id-charlie',
    '/discover/mesh/high/id-delta',
    '/discover/chronicle/low/id-echo',
  ],
  assess: [
    '/assess/incident/high/id-foxtrot',
    '/assess/signal/warning/id-golf',
    '/assess/forecast/info/id-hotel',
    '/assess/adapter/high/id-india',
  ],
  simulate: [
    '/simulate/fabric/high/id-juliet',
    '/simulate/mesh/critical/id-kilo',
    '/simulate/drill/medium/id-lima',
    '/simulate/workflow/warning/id-mike',
    '/simulate/observer/medium/id-november',
  ],
  rollback: [
    '/rollback/policy/high/id-oscar',
    '/rollback/telemetry/medium/id-papa',
    '/rollback/registry/low/id-queens',
    '/rollback/scheduler/info/id-romeo',
    '/rollback/orchestrator/critical/id-sierra',
  ],
  notify: [
    '/notify/incident/medium/id-tango',
    '/notify/signal/info/id-uniform',
    '/notify/workflow/high/id-victor',
    '/notify/adapter/info/id-whisky',
  ],
  archive: [
    '/archive/replay/low/id-xray',
    '/archive/artifact/high/id-yankee',
    '/archive/journal/info/id-zulu',
    '/archive/snapshot/low/id-omega',
  ],
} satisfies RouteCatalog;

export type GalaxyCatalog = Record<string, readonly RawRoute[]>;
export type GalaxyRoute = RawRoute;

export type ChainByRoute<T extends GalaxyRoute> = ChainThen<T>;

export const parseRouteSignature = <T extends RawRoute>(route: T): RouteMap<T> => {
  const [, action, entity, severity, id] = route.split('/') as [string, WorkAction, EntityName, WorkSeverity, WorkId];
  return {
    action,
    entity,
    severity,
    id,
  };
};

export const resolveGalaxy = (routes: readonly RawRoute[]): readonly ChainThen<RawRoute>[] =>
  routes.map((route) => {
    const parsed = parseRouteSignature(route);
    return {
      key: `${parsed.action}-${parsed.entity}-${parsed.severity}-${parsed.id}`,
      normalized: `${parsed.severity}:${parsed.id}`,
      resolved: {
        kind: parsed.action,
        target: parsed.entity,
        scope: parsed.severity,
        id: parsed.id,
        phase: 'generic',
        next: route,
      },
    } as unknown as ChainThen<RawRoute>;
  });

export type RouteSolver<T extends RawRoute> = DistributiveResolution<T> extends infer I
  ? I extends RawRoute
    ? RouteByPhase<string>
    : never
  : never;

export type RouteByPhase<TPhase extends string> = TPhase extends 'detection'
  ? { readonly phase: 'detection'; readonly requires: 'snapshot' | 'journal'; }
  : TPhase extends 'analysis'
    ? { readonly phase: 'analysis'; readonly requires: 'forecast' | 'observer'; }
    : TPhase extends 'containment'
      ? { readonly phase: 'containment'; readonly requires: 'isolate' | 'mitigate'; }
      : TPhase extends 'monitoring'
        ? { readonly phase: 'monitoring'; readonly requires: 'signal'; }
        : TPhase extends 'warning'
          ? { readonly phase: 'warning'; readonly requires: 'notify'; }
          : TPhase extends 'generic'
            ? { readonly phase: 'generic'; readonly requires: 'registry' }
  : { readonly phase: 'fallback'; readonly requires: 'archive' };

export type ChainedPhaseSolver<T extends RawRoute> = RouteSolver<T> extends { phase: infer P }
  ? RouteByPhase<P & string>
  : RouteByPhase<string>;

export type MultiDispatch<T extends readonly RawRoute[]> = {
  [K in keyof T]: ChainedPhaseSolver<T[K] & RawRoute>;
};

export const galaxyDispatchMatrix: readonly GalaxyRoute[] = Object.values(galaxyCatalog)
  .flatMap((bucket) => bucket)
  .filter((route) => route.startsWith('/')) as unknown as readonly GalaxyRoute[];

export const resolveDispatchMatrix = resolveGalaxy(galaxyDispatchMatrix as RawRoute[]);

export type GalaxyDispatch = readonly ChainThen<GalaxyRoute>[];

type RouteDepth = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type DeepRouteChain<T extends RawRoute, N extends RouteDepth = 8> = N extends 0
  ? ChainedPhaseSolver<T>
  : ChainedPhaseSolver<T> & { readonly next: ChainedPhaseSolver<T> };

export type ReduceRouteChain<T extends readonly RawRoute[]> = {
  [K in keyof T]: T[K] extends RawRoute ? DeepRouteChain<T[K], 4> : never;
};

export const routeChainMatrix: ReduceRouteChain<readonly GalaxyRoute[]> = resolveDispatchMatrix as unknown as ReduceRouteChain<
  readonly GalaxyRoute[]
>;
