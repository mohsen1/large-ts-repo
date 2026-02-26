import { Brand, NoInfer, PathValue, Prettify } from './patterns';

export type AtlasEntity =
  | 'auth'
  | 'billing'
  | 'catalog'
  | 'command'
  | 'continuity'
  | 'control'
  | 'decision'
  | 'dispatch'
  | 'drill'
  | 'fabric'
  | 'forecast'
  | 'fusion'
  | 'horizon'
  | 'incident'
  | 'intelligence'
  | 'ledger'
  | 'lifecycle'
  | 'mesh'
  | 'ops'
  | 'orchestration'
  | 'policy'
  | 'quantum'
  | 'recovery'
  | 'scenario'
  | 'saga'
  | 'signal'
  | 'storage'
  | 'strategy'
  | 'studio'
  | 'telemetry'
  | 'timeline'
  | 'workbench';

export type AtlasAction =
  | 'activate'
  | 'archive'
  | 'commit'
  | 'connect'
  | 'deploy'
  | 'disable'
  | 'disrupt'
  | 'enable'
  | 'enforce'
  | 'escalate'
  | 'extract'
  | 'inspect'
  | 'inject'
  | 'launch'
  | 'link'
  | 'mitigate'
  | 'observe'
  | 'optimize'
  | 'provision'
  | 'query'
  | 'recover'
  | 'replay'
  | 'route'
  | 'schedule'
  | 'suspend'
  | 'synthesize';

export type AtlasScope =
  | 'alpha'
  | 'beta'
  | 'canary'
  | 'core'
  | 'edge'
  | 'global'
  | 'internal'
  | 'lab'
  | 'public'
  | 'regional';

export type AtlasId =
  | '001'
  | '002'
  | '010'
  | '011'
  | '012'
  | '020'
  | '021'
  | '100'
  | '101'
  | '102'
  | '120'
  | '130'
  | '140';

export type AtlasRoute = `/${string}/${string}/${string}/${string}`;

export type AtlasRouteDiscriminant<T extends AtlasRoute> = T extends `/${infer E}/${infer A}/${infer S}/${infer I}`
  ? {
      readonly entity: E;
      readonly action: A;
      readonly scope: S;
      readonly id: I;
      readonly route: T;
      readonly signature: `${string}-${string}-${string}-${string}`;
      readonly tags: readonly [E, A, S];
    }
  : never;

export type AtlasRouteSignature<T extends AtlasRoute> = string;

export type DispatchedAtlasRoute<T extends AtlasRoute> = T extends `/${infer E}/${infer A}/${infer S}/${infer I}`
  ? {
      readonly entity: E;
      readonly action: A;
      readonly scope: S;
      readonly id: I;
      readonly route: T;
      readonly signature: AtlasRouteSignature<T>;
      readonly tags: readonly [E, A, S];
      readonly trace: `${string}-${string}-${string}-${string}`;
    }
  : never;

export type NestedResolve<T extends AtlasRoute> = T extends `${infer _}` ? DispatchedAtlasRoute<T> : never;

export type DispatchEnvelope<T extends AtlasRoute> = T extends `/${infer E}/${infer A}/${infer S}/${infer I}`
  ? E extends AtlasEntity
    ? A extends AtlasAction
      ? S extends AtlasScope
        ? I extends AtlasId
          ? {
              readonly route: `/` | T;
              readonly entity: E;
              readonly action: A;
              readonly scope: S;
              readonly id: I;
              readonly tags: readonly [`${E}`, `${A}`, `${S}`];
            }
          : never
        : never
      : never
    : never
  : never;

export type CascadeResolve<T extends AtlasRoute> = T extends `/${infer E}/${infer A}/${infer S}/${infer I}`
  ? {
      readonly entity: E;
      readonly action: A;
      readonly scope: S;
      readonly id: I;
      readonly route: T;
      readonly signature: AtlasRouteSignature<T>;
      readonly tags: readonly [E, A, S];
      readonly trace: `${string}-${string}-${string}-${string}`;
      readonly priority: T extends `${string}/synthesize/${string}/${string}` | `${string}/recover/${string}/${string}`
        ? 'critical'
        : 'standard';
    }
  : never;

export type AtlasCatalog<T extends readonly AtlasRoute[]> = {
  [K in keyof T]: T[K] extends AtlasRoute ? CascadeResolve<T[K]> : never;
};

export type AtlasCatalogLookup<T extends AtlasRoute> = T extends AtlasRoute ? CascadeResolve<T> : never;

export type AtlasRuntimeHint<T extends AtlasRoute> = T extends `${string}/${infer A}/${infer S}/${infer I}`
  ? A extends AtlasAction
    ? S extends AtlasScope
      ? I extends AtlasId
        ? {
            readonly hint: `${A}-${S}`;
            readonly bucket: Brand<I, 'atlas-id'>;
            readonly route: T;
          }
        : never
      : never
    : never
  : never;

export type ResolveAtlasBundle<T extends readonly AtlasRoute[]> = {
  [K in keyof T]: T[K] extends AtlasRoute
    ? {
        readonly envelope: AtlasRuntimeHint<T[K]>;
      }
    : never;
};

export type DeepAtlasChain<
  T extends AtlasRoute,
  Steps extends readonly AtlasRoute[] = readonly AtlasRoute[],
> = Steps extends [infer Head, ...infer Tail]
  ? Head extends AtlasRoute
    ? Tail extends readonly AtlasRoute[]
      ? { readonly cursor: T; readonly next: AtlasRoute | never; readonly remain: AtlasCatalogLookup<Head> }
      : never
    : never
  : { readonly terminal: AtlasCatalogLookup<T> };

export const atlasRouteSeed = [
  '/incident/inspect/regional/001',
  '/recovery/recover/core/002',
  '/policy/enforce/canary/011',
  '/signal/observe/edge/021',
  '/fabric/route/public/100',
  '/quantum/synthesize/lab/120',
  '/strategy/provision/edge/130',
  '/timeline/replay/global/140',
] as const;

export const atlasRoutes = atlasRouteSeed satisfies readonly AtlasRoute[];

export type AtlasRouteUnion = (typeof atlasRoutes)[number];
export type AtlasRouteKeys = keyof typeof atlasRoutes;

export const resolveAtlasRoute = <T extends AtlasRoute>(route: T) => {
  const parts = route.split('/').filter(Boolean);
  const [entity, action, scope, id] = parts as [AtlasEntity, AtlasAction, AtlasScope, AtlasId];
  const discriminant = { entity, action, scope, id, segments: parts as [AtlasEntity, AtlasAction, AtlasScope, AtlasId] } as const;
  const payload = {
    route,
    entity,
    action,
    scope,
    id,
    tags: [entity, action, scope] as const,
    signature: `${entity}` as string,
    trace: `${entity}` as string,
    priority: action === 'synthesize' || action === 'recover' || action === 'mitigate' ? 'critical' : 'standard',
  } as unknown as CascadeResolve<T>;
  return {
    discriminant,
    payload,
  };
};

export type AtlasRouteLookup = ReturnType<typeof resolveAtlasRoute>;

export const buildAtlasCatalog = (routes: readonly AtlasRoute[]) => {
  const registry = new Map<string, AtlasRouteLookup>();
  for (const route of routes) {
    const { discriminant, payload } = resolveAtlasRoute(route);
    registry.set(route, {
      discriminant,
      payload,
    });
  }
  return Object.fromEntries(Array.from(registry.entries()));
};

export const atlasCatalogLookup = buildAtlasCatalog([...atlasRoutes]);

export type RouteFromValue<T extends string> = T extends AtlasRoute ? AtlasCatalogLookup<T> : never;

export const resolveFromValue = <T extends AtlasRoute>(value: T): RouteFromValue<T> =>
  resolveAtlasRoute(value) as unknown as RouteFromValue<T>;

export type RouteValueProjection<T extends AtlasRouteUnion> = CascadeResolve<T>;

export const routeValueProjection = <T extends AtlasRouteUnion>(value: T): RouteValueProjection<T> => {
  return resolveAtlasRoute(value).payload as RouteValueProjection<T>;
};

export const atlasChain = (routes: AtlasRoute[]) => {
  const result = routes.reduce(
    (state, route, index) => ({
      ...state,
      [route]: state[route] ?? index,
    }),
    {} as Record<AtlasRoute, number>,
  );
  return result;
};

export type AtlasChainResult = ReturnType<typeof atlasChain>;

export const atlasRouteCatalog = atlasRoutes;

export const hydrateAtlasChain = (routes: readonly NoInfer<AtlasRoute>[]) => {
  const chain = atlasChain([...routes] as AtlasRoute[]);
  return chain;
};

type AtlasLookup = keyof typeof atlasCatalogLookup;
export const resolveAtlasRouteByScope = <S extends AtlasScope>(scope: S) =>
  atlasRoutes.filter((route) => route.includes(`/${scope}/`)) as Extract<AtlasRouteUnion, string & `${AtlasEntity}/${AtlasAction}/${S}/${AtlasId}`>[];

export const routeDiagnostics = (route: AtlasRouteUnion) => {
  const payload = resolveAtlasRoute(route);
  const scope = payload.discriminant.scope;
  const routeHint = `${payload.discriminant.entity}:${payload.discriminant.action}:${scope}`;
  const isCritical = payload.payload.priority === 'critical';
  const identity = [payload.discriminant.entity, payload.discriminant.action, scope].join('/');
  return { scope, isCritical, routeHint, identity };
};

export const atlasScopeMap: Record<AtlasScope, AtlasRouteUnion[]> = {
  alpha: atlasRoutes.filter((route) => route.endsWith('/001')),
  beta: atlasRoutes.filter((route) => route.endsWith('/002')),
  canary: atlasRoutes.filter((route) => route.endsWith('/011')),
  core: atlasRoutes.filter((route) => route.includes('/core/')),
  edge: atlasRoutes.filter((route) => route.includes('/edge/')),
  global: atlasRoutes.filter((route) => route.includes('/global/')),
  internal: atlasRoutes.filter((route) => route.includes('/internal/')),
  lab: atlasRoutes.filter((route) => route.includes('/lab/')),
  public: atlasRoutes.filter((route) => route.includes('/public/')),
  regional: atlasRoutes.filter((route) => route.includes('/regional/')),
};

export type AtlasCatalogProjection<T extends AtlasRouteUnion> = {
  readonly source: PathValue<{ readonly route: T }, 'route'>;
  readonly diagnostics: ReturnType<typeof routeDiagnostics>;
  readonly index: AtlasLookup;
};

export const resolveAtlasProjection = <T extends AtlasRouteUnion>(route: T): AtlasCatalogProjection<T> => ({
  source: route,
  diagnostics: routeDiagnostics(route),
  index: route,
});

export const atlasDiagnosticMap = atlasRoutes.reduce(
  (acc, route) => ({
    ...acc,
    [route]: routeDiagnostics(route),
  }),
  {} as {
    [K in AtlasRouteUnion]: ReturnType<typeof routeDiagnostics>;
  },
);

export type AtlasScopeSignature = {
  readonly [K in AtlasScope]: {
    readonly routeCount: number;
    readonly routes: readonly AtlasRoute[];
  };
};

export const atlasScopeSignature = () => {
  return Object.entries(atlasScopeMap).reduce(
    (acc, [scope, routes]) => ({
      ...acc,
      [scope]: {
        routeCount: routes.length,
        routes,
      },
    }),
    {} as AtlasScopeSignature,
  );
};
