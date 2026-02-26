export type FabricDomain = 'incident' | 'fabric' | 'workflow' | 'policy' | 'mesh' | 'ops';
export type FabricSlice = 'compose' | 'drain' | 'observe' | 'repair' | 'verify' | 'close' | 'audit';
export type FabricResource = 'node' | 'stream' | 'route' | 'trace' | 'bundle' | 'metric' | 'ledger';
export type FabricStage = 'alpha' | 'beta' | 'gamma' | 'delta' | 'omega';

export type FabricRoute = `/${FabricDomain}/${FabricSlice}/${FabricResource}/${FabricStage}/${number}`;

export type ExtractDomain<T extends FabricRoute> = T extends `/${infer D}/${string}/${string}/${string}/${string}`
  ? D & FabricDomain
  : never;

export type ExtractSlice<T extends FabricRoute> = T extends `/${string}/${infer S}/${string}/${string}/${string}`
  ? S & FabricSlice
  : never;

export type ExtractResource<T extends FabricRoute> = T extends `/${string}/${string}/${infer R}/${string}/${string}`
  ? R & FabricResource
  : never;

export type ExtractStage<T extends FabricRoute> = T extends `/${string}/${string}/${string}/${infer S}/${string}`
  ? S & FabricStage
  : never;

export type FabricRouteShape<T extends FabricRoute> = {
  readonly domain: ExtractDomain<T>;
  readonly slice: ExtractSlice<T>;
  readonly resource: ExtractResource<T>;
  readonly stage: ExtractStage<T>;
  readonly segment: T extends `/${string}/${string}/${string}/${string}/${infer Id}` ? Id : never;
};

export type RouteTokens<T extends readonly FabricRoute[]> = {
  [K in keyof T]: T[K] extends FabricRoute ? FabricRouteShape<T[K]> : never;
};

export type RemapByTemplate<T extends Record<string, FabricRoute>> = {
  [K in keyof T as K extends string
    ? `fabric-${Lowercase<K & string>}`
    : never]: T[K] extends FabricRoute ? FabricRouteShape<T[K]> : never;
};

export type RouteAlias<T extends string> = T extends `${infer Prefix}:${infer Segment}`
  ? `${Prefix}::${Lowercase<Segment>}`
  : `${Lowercase<T>}`;

export type TemplateMap<T extends readonly string[]> = {
  [K in keyof T]: K extends number ? RouteAlias<T[K] & string> : never;
};

export type RouteKeychain<T extends Record<string, FabricRoute>> = {
  readonly [K in keyof T as K extends string ? `${K & string}-template` : never]: {
    readonly key: K;
    readonly route: T[K];
    readonly tokens: SplitTokens<T[K]>;
  };
};

export type SplitTokens<T extends string> = T extends `${infer H}/${infer R}`
  ? R extends ''
    ? [H]
    : [H, ...SplitTokens<R>]
  : [T];

export type Repack<T extends Record<string, FabricRoute>> = {
  [K in keyof T as K extends string ? `rk-${K & string}` : never]: {
    readonly route: T[K];
    readonly token: K;
  };
};

export type ConstrainedMap<T extends readonly FabricRoute[]> = {
  readonly domains: {
    [K in T[number] as ExtractDomain<K>]: FabricRouteShape<K>;
  };
  readonly union: T[number];
  readonly map: Repack<Record<string, T[number]>>;
};

export const fabricateRouteCatalog = [
  '/incident/compose/node/alpha/101',
  '/fabric/observe/stream/beta/211',
  '/workflow/drain/route/gamma/330',
  '/policy/repair/bundle/delta/411',
  '/mesh/verify/trace/omega/512',
  '/ops/close/metric/alpha/601',
  '/incident/audit/ledger/beta/701',
] as const satisfies readonly FabricRoute[];

export type FabricCatalog = typeof fabricateRouteCatalog;
export type FabricTuple = RouteTokens<FabricCatalog>;

export type FabricRemap = RemapByTemplate<Record<`${string}-route`, FabricRoute>>;

export const mapTemplateRemap = <T extends Record<string, FabricRoute>>(catalog: T): RouteKeychain<T> => {
  const entries = Object.entries(catalog) as Array<[string, FabricRoute]>;
  const out: Record<string, { key: string; route: FabricRoute; tokens: string[] }> = {};

  for (const [key, route] of entries) {
    const tokens = route.split('/');
    out[`fabric-${key.toLowerCase()}-template`] = {
      key,
      route,
      tokens,
    };
  }

  return out as RouteKeychain<T>;
};

export const parseFabricRoute = <T extends FabricRoute>(route: T): FabricRouteShape<T> => {
  const parts = route.split('/');
  return {
    domain: parts[1] as ExtractDomain<T>,
    slice: parts[2] as ExtractSlice<T>,
    resource: parts[3] as ExtractResource<T>,
    stage: parts[4] as ExtractStage<T>,
    segment: (parts[5] ?? '') as any,
  };
};

export const profileFabric = (route: FabricRoute): FabricRouteShape<FabricRoute> => {
  return parseFabricRoute(route as FabricRoute) as FabricRouteShape<FabricRoute>;
};

export const profileBatch = (routes: readonly FabricRoute[]): ReadonlyArray<{
  readonly route: FabricRoute;
  readonly profile: FabricRouteShape<FabricRoute>;
}> => {
  const out: Array<{ route: FabricRoute; profile: FabricRouteShape<FabricRoute> }> = [];
  for (const route of routes) {
    out.push({ route, profile: profileFabric(route) });
  }
  return out;
};

export const buildTemplateAlias = (catalog: readonly string[]): TemplateMap<readonly string[]> => {
  return catalog.map((raw) => {
    const [prefix, seg] = raw.split(':');
    return (seg ? `${prefix}::${seg.toLowerCase()}` : raw.toLowerCase()) as string as TemplateMap<readonly string[]>[number];
  }) as TemplateMap<readonly string[]>;
};

const toRouteShapeList = <T extends readonly FabricRoute[]>(catalog: T): RouteTransform<T> => {
  return catalog.map((route) => {
    return parseFabricRoute(route as T[number]);
  }) as unknown as RouteTransform<T>;
};

export const buildRouteConstrainedMap = (
  catalog: FabricCatalog,
): {
  readonly routeMap: RouteTransform<FabricCatalog>;
  readonly remap: RemapByTemplate<Record<string, FabricRoute>>;
  readonly profile: RouteTransform<FabricCatalog>;
} => {
  const asDict = catalog.reduce<Record<string, FabricRoute>>((acc, route, index) => {
    acc[`route_${index}`] = route;
    return acc;
  }, {});
  const remap = mapTemplateRemap(asDict);
  const routeMap = toRouteShapeList(catalog);
  const profile = toRouteShapeList(catalog) as unknown as RouteTransform<FabricCatalog>;
  return {
    routeMap,
    remap: remap as RemapByTemplate<Record<string, FabricRoute>>,
    profile,
  } as unknown as {
    readonly routeMap: RouteTokens<FabricCatalog>;
    readonly remap: RemapByTemplate<Record<string, FabricRoute>>;
    readonly profile: RouteTransform<FabricCatalog>;
  };
};

export type RouteTransform<T extends readonly FabricRoute[]> = {
  [K in keyof T]: T[K] extends FabricRoute ? FabricRouteShape<T[K]> : never;
};

export const orbitTemplateUnion = fabricateRouteCatalog.join('|');
export const orbitTemplateCatalog = buildRouteConstrainedMap(fabricateRouteCatalog);
