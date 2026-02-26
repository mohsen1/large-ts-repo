export type RouteVerb =
  | 'drill'
  | 'route'
  | 'resolve'
  | 'emit'
  | 'observe'
  | 'notify'
  | 'rollback'
  | 'reconcile'
  | 'suppress'
  | 'release';
export type RouteDomain =
  | 'atlas'
  | 'fabric'
  | 'policy'
  | 'incident'
  | 'timeline'
  | 'ops'
  | 'mesh'
  | 'recovery';
export type RouteLevel = 'critical' | 'high' | 'medium' | 'low' | 'warm';
export type RouteScope = 'tenant' | 'workload' | 'session' | 'service';

export type CascadeRoute = `${string}/${string}/${string}/${string}/${number}`;

export type RouteTokens<T extends string> = T extends `${infer D}/${infer V}/${infer L}/${infer S}/${infer I}`
  ? {
      readonly domain: D;
      readonly verb: V;
      readonly level: L;
      readonly scope: S;
      readonly id: I;
    }
  : never;

export type EventLabelFromRoute<T extends CascadeRoute> = T extends RouteTokens<T>
  ? `${Uppercase<T['domain'] | ''>}_${Uppercase<T['verb'] | ''>}_${Uppercase<T['level'] | ''>}_${Uppercase<T['scope'] | ''>}`
  : never;

export type RouteCategory<T extends string> = T extends `${string}/drill/${string}/${string}/${string}`
  ? { readonly category: 'drill'; readonly importance: 100 }
  : T extends `${string}/route/${string}/${string}/${string}`
    ? { readonly category: 'routing'; readonly importance: 80 }
    : T extends `${string}/resolve/${string}/${string}/${string}`
      ? { readonly category: 'resolution'; readonly importance: 90 }
      : T extends `${string}/notify/${string}/${string}/${string}`
        ? { readonly category: 'telemetry'; readonly importance: 30 }
        : T extends `${string}/rollback/${string}/${string}/${string}`
          ? { readonly category: 'rollback'; readonly importance: 70 }
          : T extends `${string}/reconcile/${string}/${string}/${string}`
            ? { readonly category: 'sync'; readonly importance: 60 }
            : T extends `${string}/suppress/${string}/${string}/${string}`
              ? { readonly category: 'signal'; readonly importance: 50 }
              : { readonly category: 'generic'; readonly importance: 10 };

export type RouteBudget<T extends string> = T extends `${string}/${string}/critical/${string}/${string}`
  ? 1
  : T extends `${string}/${string}/high/${string}/${string}`
    ? 2
    : T extends `${string}/${string}/medium/${string}/${string}`
      ? 4
      : T extends `${string}/${string}/low/${string}/${string}`
        ? 8
        : T extends `${string}/${string}/warm/${string}/${string}`
          ? 16
          : 32;

export type RouteResolution<T extends CascadeRoute> = RouteCategory<T> & {
  readonly route: T;
  readonly tokens: RouteTokens<T>;
  readonly label: EventLabelFromRoute<T>;
  readonly budget: RouteBudget<T>;
};

export type RouteCatalog = {
  readonly atlas: string;
  readonly mesh: string;
  readonly fabric: string;
  readonly policy: string;
};

export type RouteCatalogUnion = string;

export type DistilledRoute<T extends CascadeRoute> = RouteResolution<T> & { readonly resolved: true };
export type DistilledCatalog<T extends readonly CascadeRoute[]> = {
  [K in keyof T]: T[K] extends CascadeRoute ? DistilledRoute<T[K]> : never;
};

export type ParseCatalogTemplate<T extends ReadonlyArray<CascadeRoute>> = {
  [K in keyof T]: RouteResolution<T[K] & CascadeRoute>;
};

export const routeCatalog = [
  'atlas/route/critical/tenant/1001',
  'fabric/drill/high/session/1002',
  'policy/resolve/medium/workload/1003',
  'incident/notify/low/service/1004',
  'mesh/reconcile/high/workload/1005',
  'ops/rollback/critical/session/1006',
  'ops/suppress/warm/tenant/1007',
  'recovery/observe/low/workload/1008',
] as const;

export const parseCascadeRoute = <T extends CascadeRoute>(route: T): RouteTokens<T> => {
  const [domain, verb, level, scope, id] = route.split('/') as [string, string, string, string, string];
  return {
    domain,
    verb,
    level,
    scope,
    id,
  } as RouteTokens<T>;
};

export const labelRoute = <T extends CascadeRoute>(route: T): EventLabelFromRoute<T> => {
  const parts = parseCascadeRoute(route);
  return `${parts.domain.toUpperCase()}_${parts.verb.toUpperCase()}_${parts.level.toUpperCase()}_${parts.scope.toUpperCase()}` as EventLabelFromRoute<T>;
};

export const routeResolution = <T extends readonly CascadeRoute[]>(routes: T): DistilledCatalog<T> => {
  const resolved = routes.map((route) => {
    const parsed = parseCascadeRoute(route);
    const label = labelRoute(route);
    return {
      ...resolveRoute(route),
      route,
      tokens: parsed,
      label,
      resolved: true,
    } as DistilledRoute<CascadeRoute>;
  }) as unknown as DistilledCatalog<T>;
  return resolved;
};

export const resolveRoute = <T extends CascadeRoute>(route: T): RouteResolution<T> => {
  const tokens = parseCascadeRoute(route);
  const label = labelRoute(route);

  const severity: RouteLevel = tokens.level as RouteLevel;
  const budget =
    severity === 'critical'
      ? 1
      : severity === 'high'
        ? 2
        : severity === 'medium'
          ? 4
          : severity === 'low'
            ? 8
            : 16;

  const category =
    route.includes('/drill/')
      ? { category: 'drill', importance: 100 }
      : route.includes('/route/')
        ? { category: 'routing', importance: 80 }
        : route.includes('/resolve/')
          ? { category: 'resolution', importance: 90 }
          : route.includes('/notify/')
            ? { category: 'telemetry', importance: 30 }
            : route.includes('/rollback/')
              ? { category: 'rollback', importance: 70 }
              : route.includes('/reconcile/')
                ? { category: 'sync', importance: 60 }
                : route.includes('/suppress/')
                  ? { category: 'signal', importance: 50 }
                  : { category: 'generic', importance: 10 };

  return {
    route,
    tokens,
    label,
    budget,
    ...category,
  } as RouteResolution<T>;
};

export const routeMatrix = <
  T extends readonly CascadeRoute[],
>(routes: T): ParseCatalogTemplate<T> => {
  return routes.map((route) => resolveRoute(route) as unknown as RouteResolution<CascadeRoute>) as unknown as ParseCatalogTemplate<T>;
};

export const resolveRoutes = <T extends readonly CascadeRoute[]>(
  routes: T,
): { readonly [K in keyof T]: DistilledRoute<T[K]> } => {
  return routes.map((route) => routeResolution([route])[0]) as unknown as {
    readonly [K in keyof T]: DistilledRoute<T[K]>;
  };
};

export const buildCascadeKey = <T extends CascadeRoute>(route: T): `route:${T}` => `route:${route}`;

export const resolveRoutesInCascade = (routes: readonly RouteCatalogUnion[]) => {
  return routes.map((route) => {
    const resolution = resolveRoute(route as CascadeRoute);
    return {
      token: buildCascadeKey(route as CascadeRoute),
      scopeWeight: resolution.tokens.scope.length,
      budget: resolution.budget,
      category: resolution.category,
    } as const;
  });
};

export const evaluateRoute = <T extends CascadeRoute>(route: T): RouteResolution<T> => resolveRoute(route);

export const evaluateRoutes = <T extends readonly CascadeRoute[]>(routes: T): DistilledCatalog<T> => routeResolution(routes);
