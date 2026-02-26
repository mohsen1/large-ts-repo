export const routeEntities = [
  'incident',
  'policy',
  'workload',
  'scheduler',
  'orchestrator',
  'chronicle',
  'telemetry',
  'risk',
] as const;

export const routeActions = [
  'create',
  'update',
  'observe',
  'recover',
  'evacuate',
  'synthesize',
  'contain',
  'audit',
] as const;

export const routeIds = [
  'alpha',
  'beta',
  'gamma',
  'delta',
  'epsilon',
  'zeta',
  'eta',
] as const;

export type Entity = typeof routeEntities[number];
export type Action = typeof routeActions[number];
export type IdToken = typeof routeIds[number];

export type RoutePattern = `/${Entity}/${Action}/${IdToken}`;

export type RouteSet =
  | `/incident/${Action}/${IdToken}`
  | `/policy/${Action}/${IdToken}`
  | `/workload/${Action}/${IdToken}`
  | `/scheduler/${Action}/${IdToken}`
  | `/orchestrator/${Action}/${IdToken}`
  | `/chronicle/${Action}/${IdToken}`
  | `/telemetry/${Action}/${IdToken}`
  | `/risk/${Action}/${IdToken}`;

export type ParsedRoute<T extends RoutePattern> = T extends `/${infer REntity}/${infer RAction}/${infer RId}`
  ? {
      readonly entity: REntity;
      readonly action: RAction;
      readonly id: RId;
    }
  : never;

export type RouteParts<T> =
  T extends string
    ? T extends `/${infer REntity}/${infer RAction}/${infer RId}`
      ? {
          route: T;
          entity: REntity;
          action: RAction;
          id: RId;
          scope: REntity extends 'incident' | 'risk' ? 'security' : 'operational';
          normalized: `${Uppercase<REntity>}_${Uppercase<RAction>}_${Uppercase<RId>}`;
        }
      : never
    : never;

export type RouteMap<T extends ReadonlyArray<RoutePattern>> = {
  [K in keyof T & number as T[K] extends string ? T[K] : never]: RouteParts<T[K]>;
};

export type RouteProjection<T extends ReadonlyArray<RoutePattern>> = RouteParts<T[number]>;

export type RouteMatcher<T extends string> =
  T extends RoutePattern
    ? RouteParts<T>
    : T extends `${infer AnyEntity}/${infer AnyAction}/${infer AnyId}`
      ? { readonly entity: AnyEntity; readonly action: AnyAction; readonly id: AnyId; readonly route: `/${AnyEntity}/${AnyAction}/${AnyId}` }
      : never;

export const generatedRoutes = routeEntities
  .flatMap((entity) => routeActions.flatMap((action) => routeIds.map((id) => `/${entity}/${action}/${id}` as const)))
  .slice(0, 64) as RoutePattern[];

export const routeIndex = generatedRoutes.reduce<Record<string, RouteParts<RoutePattern>>>((acc, route) => {
  acc[route] = {
    entity: route.split('/')[1],
    action: route.split('/')[2],
    id: route.split('/')[3],
    scope: route.includes('/incident/') ? 'security' : 'operational',
    normalized: route.toUpperCase().replaceAll('/', '_'),
  } as RouteParts<typeof route>;
  return acc;
}, {} as Record<string, RouteParts<RoutePattern>>);

export const parseRoute = <T extends string>(route: T): RouteMatcher<T> => {
  const [_, entity, action, id] = route.split('/') as [string, string, string, string];
  return {
    route: route as `/${string}/${string}/${string}`,
    entity,
    action,
    id,
    scope: entity === 'incident' || entity === 'risk' ? 'security' : 'operational',
    normalized: `${entity.toUpperCase()}_${action.toUpperCase()}_${id.toUpperCase()}` as const,
  } as RouteMatcher<T>;
};

export const routeHandlers = generatedRoutes.reduce((acc, route) => {
  const parsed = parseRoute(route);
  acc[route] = () => ({ route: parsed, timestamp: Date.now() });
  return acc;
}, {} as Record<RoutePattern, (input?: unknown) => { route: RouteParts<RoutePattern>; timestamp: number }>);

export type RouteInputByDomain<T extends RoutePattern> = T extends `/${infer D}/${infer A}/${infer I}`
  ? D extends 'incident' | 'risk'
    ? { domain: 'safety'; action: A; id: I }
    : { domain: 'ops'; action: A; id: I }
  : never;

export const routeInputCatalog = Object.entries(routeHandlers).reduce<Record<string, { domain: string; action: string; id: string }>>(
  (acc, [key]) => {
    const parsed = parseRoute(key as RoutePattern);
    acc[key] = {
      domain: parsed.scope,
      action: parsed.action,
      id: parsed.id,
    };
    return acc;
  },
  {},
);

export const matchRoute = <T extends RoutePattern>(route: T) => {
  return routeHandlers[route]();
};

export const routeMatcher = <T extends string>(route: T): RouteMatcher<T> => parseRoute(route) as RouteMatcher<T>;

export type NestedRouteCatalog = {
  [E in Entity]: {
    [A in Action]: {
      readonly [I in IdToken]: RouteParts<`/${E}/${A}/${I}`>;
    };
  };
};

export const nestedRouteCatalog = routeEntities.reduce<NestedRouteCatalog>((acc, entity) => {
  const next = acc as Record<string, Record<string, Record<string, RouteParts<RoutePattern>>>>;
  next[entity] = {};
  routeActions.forEach((action) => {
    const idMap = {} as Record<string, RouteParts<RoutePattern>>;
    routeIds.forEach((id) => {
      idMap[id] = parseRoute(`/${entity}/${action}/${id}`);
    });
    next[entity][action] = idMap;
  });
  return acc;
}, {} as NestedRouteCatalog);
