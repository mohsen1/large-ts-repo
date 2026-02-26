export type ControlDomain =
  | 'incident'
  | 'fabric'
  | 'mesh'
  | 'horizon'
  | 'timeline'
  | 'policy'
  | 'telemetry'
  | 'orchestrator'
  | 'signal'
  | 'workflow'
  | 'registry'
  | 'runtime'
  | 'artifact'
  | 'snapshot'
  | 'journal'
  | 'replay'
  | 'gateway'
  | 'observer'
  | 'connector';

export type ControlVerb =
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
  | 'notify'
  | 'archive';

export type ControlSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'warning' | 'resolved';
export type ControlTenant = `tenant-${string}`;
export type ControlRoute = `/${ControlDomain}/${ControlVerb}/${ControlSeverity}/${ControlTenant}`;

export type RouteTuple<T extends string> = T extends `/${infer D}/${infer V}/${infer S}/${infer I}`
  ? [D, V, S, I]
  : ['unknown', 'unknown', 'unknown', 'unknown'];

export type RouteParts<T extends ControlRoute> = {
  readonly domain: RouteTuple<T>[0];
  readonly verb: RouteTuple<T>[1];
  readonly severity: RouteTuple<T>[2];
  readonly tenant: RouteTuple<T>[3];
};

export type ResolveRoute<T extends string> =
  T extends `${infer D}/${infer V}/${infer S}/${infer I}`
    ? {
        readonly domain: D extends ControlDomain ? D : never;
        readonly verb: V extends ControlVerb ? V : never;
        readonly severity: S extends ControlSeverity ? S : never;
        readonly tenant: I extends ControlTenant ? I : never;
        readonly phase: D extends 'incident'
          ? 'incident'
          : D extends 'policy'
            ? 'policy'
            : D extends 'telemetry'
              ? 'observation'
              : 'generic';
      }
    : {
        readonly domain: 'incident';
        readonly verb: 'discover';
        readonly severity: 'medium';
        readonly tenant: `tenant-unknown`;
        readonly phase: 'generic';
      };

export type RouteEnvelope<T extends ControlRoute> = {
  readonly route: T;
  readonly parts: RouteParts<T>;
  readonly phase: ResolveRoute<T>['phase'];
  readonly alias: `${RouteTuple<T>[0]}:${RouteTuple<T>[1]}`;
  readonly normalized: `/${Lowercase<RouteTuple<T>[0] & string>}/${Lowercase<RouteTuple<T>[1] & string>}`;
};

export type ControlRouteCatalog = {
  discover: readonly ControlRoute[];
  assess: readonly ControlRoute[];
  rollback: readonly ControlRoute[];
  notify: readonly ControlRoute[];
  archive: readonly ControlRoute[];
};

export type RouteCatalogByVerb<T extends keyof ControlRouteCatalog> = ControlRouteCatalog[T];
export type CatalogEntry = ControlRouteCatalog[keyof ControlRouteCatalog][number];
export type ControlCatalogEntries = CatalogEntry;
export type ControlCatalogByVerb = ControlRouteCatalog;
export type ControlRemapped = Record<
  string,
  {
    readonly route: CatalogEntry;
    readonly index: number;
    readonly active: boolean;
  }
>;

export type RouteMap<T extends readonly CatalogEntry[]> = {
  [K in keyof T]: ResolveRoute<T[K]> & { readonly source: T[K] };
};
export type RouteCatalogTuple = readonly [CatalogEntry, ...CatalogEntry[]];

type BuildTuple<N extends number, Acc extends readonly unknown[] = []> = Acc['length'] extends N
  ? Acc
  : BuildTuple<N, [...Acc, unknown]>;

type Decrement<N extends number> = N extends 0 ? 0 : BuildTuple<N> extends [unknown, ...infer Rest] ? Rest['length'] & number : never;

export type RouteFold<T extends ControlRoute, N extends number = 4> =
  N extends 0 ? readonly [T] : readonly [T, ...RouteFold<T, Decrement<N>>];

export type RouteRemap<T extends Record<string, unknown>> = {
  [K in keyof T as `template:${K & string}`]: T[K];
};

export const controlRouteCatalog = {
  discover: [
    '/incident/discover/critical/tenant-alpha',
    '/fabric/discover/high/tenant-beta',
    '/mesh/discover/medium/tenant-gamma',
  ],
  assess: [
    '/policy/assess/high/tenant-delta',
    '/telemetry/assess/low/tenant-epsilon',
  ],
  rollback: [
    '/runtime/rollback/high/tenant-zeta',
    '/orchestrator/rollback/critical/tenant-eta',
  ],
  notify: [
    '/incident/notify/warning/tenant-theta',
    '/journal/notify/info/tenant-iota',
  ],
  archive: [
    '/snapshot/archive/low/tenant-kappa',
    '/journal/archive/low/tenant-lambda',
  ],
} satisfies ControlRouteCatalog;

export type CatalogByRoute = typeof controlRouteCatalog;
export type RouteCatalogEntries = CatalogByRoute[keyof CatalogByRoute][number];

export type ControlResolutionGraph<T extends readonly CatalogEntry[]> = {
  readonly catalog: RouteMap<T>;
  readonly fold: RouteFold<T[number], 3>;
  readonly map: ReadonlyMap<ControlSeverity, ReadonlySet<RouteCatalogEntries>>;
};

export const parseRoute = <T extends CatalogEntry>(route: T): RouteEnvelope<T> => {
  const [, domain, verb, severity, tenant] = route.split('/') as [string, ControlDomain, ControlVerb, ControlSeverity, ControlTenant];
  return {
    route,
    parts: {
      domain,
      verb,
      severity,
      tenant,
    },
    phase: (domain === 'incident' ? 'incident' : 'generic') as RouteEnvelope<T>['phase'],
    alias: `${domain}:${verb}`,
    normalized: `/${domain.toLowerCase() as Lowercase<string>}/${verb.toLowerCase() as Lowercase<string>}` as RouteEnvelope<T>['normalized'],
  };
};

export const buildRouteGraph = <T extends readonly RouteCatalogEntries[]>(routes: T): ControlResolutionGraph<T> => {
  const map = new Map<ControlSeverity, Set<RouteCatalogEntries>>();
  for (const route of routes) {
    const [, , severity, tenant] = route.split('/');
    const current = map.get(severity as ControlSeverity) ?? new Set<RouteCatalogEntries>();
    current.add(route);
    map.set(severity as ControlSeverity, current);
  }
  return {
    catalog: routes.map((route) => parseRoute(route)) as RouteMap<T>,
    fold: [routes[0] ?? '/incident/discover/critical/tenant-alpha', ...routes.slice(0, 2)] as unknown as RouteFold<T[number], 3>,
    map,
  };
};

export type MappedRouteCatalog = RouteRemap<{
  discover: {
    readonly route: CatalogEntry;
    readonly active: boolean;
  };
  assess: {
    readonly route: CatalogEntry;
    readonly active: boolean;
  };
}>;

export const mappedControlCatalog: MappedRouteCatalog = {
  'template:discover': {
    route: controlRouteCatalog.discover[0] ?? '/incident/discover/critical/tenant-alpha',
    active: true,
  },
  'template:assess': {
    route: controlRouteCatalog.assess[0] ?? '/policy/assess/high/tenant-delta',
    active: true,
  },
};

export type ResolveControlEnvelope<T extends readonly RouteCatalogEntries[]> = RouteMap<T>;
export const resolveControlEnvelope = <T extends readonly RouteCatalogEntries[]>(
  catalog: T,
): ControlResolutionGraph<T> => buildRouteGraph(catalog);

export const controlCatalogEntries: readonly CatalogEntry[] = [
  ...controlRouteCatalog.discover,
  ...controlRouteCatalog.assess,
  ...controlRouteCatalog.rollback,
  ...controlRouteCatalog.notify,
  ...controlRouteCatalog.archive,
];

export const controlGraph = buildRouteGraph(controlCatalogEntries as readonly RouteCatalogEntries[]);
