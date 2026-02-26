export type RouteDomain =
  | 'atlas'
  | 'control'
  | 'ops'
  | 'signal'
  | 'mesh'
  | 'policy'
  | 'saga'
  | 'quantum'
  | 'timeline';

export type RouteAction =
  | 'bootstrap'
  | 'simulate'
  | 'safeguard'
  | 'resolve'
  | 'verify'
  | 'contain'
  | 'release'
  | 'snapshot'
  | 'observe'
  | 'route'
  | 'heal';

export type RouteEntity =
  | 'tenant'
  | 'node'
  | 'channel'
  | 'saga'
  | 'incident'
  | 'playbook'
  | 'workflow'
  | 'policy';

export type RouteBlueprint = {
  readonly route: `${RouteDomain}/${RouteAction}/${RouteEntity}`;
  readonly timeoutMs: number;
  readonly enabled: boolean;
};

export type RouteBlueprintCatalog = Record<string, RouteBlueprint>;

export type MappedRouteKeys<T extends RouteBlueprintCatalog> = {
  [K in keyof T & string as `route_${K}`]: T[K]['route'];
};

export type InverseRouteCatalog<T extends RouteBlueprintCatalog> = {
  [K in keyof T as T[K]['route']]: {
    readonly source: K;
    readonly enabled: T[K]['enabled'];
    readonly timeoutMs: T[K]['timeoutMs'];
  }
};

export type PrefixByKind<T extends RouteBlueprintCatalog> = {
  [K in keyof T as `catalog_${K & string}`]: {
    readonly title: K;
    readonly timeoutMs: T[K]['timeoutMs'];
  }
};

export type PathToken<T extends string> = T extends `${infer Domain}/${infer Action}/${infer Entity}`
  ? { readonly domain: Domain; readonly action: Action; readonly entity: Entity }
  : never;

export type RouteTokens<T extends RouteBlueprintCatalog> = {
  [K in keyof T]: K extends string ? PathToken<K> : never;
};

export type NormalizedPath<T extends string> = T extends `/${infer Value}`
  ? Value
  : T;

export type BuildTemplatePath<T extends string> = T extends `${infer D}/${infer A}/${infer E}`
  ? `${Uppercase<D>}/${Uppercase<A>}/${Uppercase<E>}`
  : never;

export type RouteTemplate<T extends RouteBlueprintCatalog> = {
  [K in keyof T as K extends string ? BuildTemplatePath<K> : never]: {
    readonly enabled: T[K]['enabled'];
    readonly timeoutMs: T[K]['timeoutMs'];
    readonly route: T[K]['route'];
  };
};

export type RoutedEvent<K extends string, T> = K extends keyof T ? { readonly key: K; readonly value: T[K] } : never;

export type RouteEventUnion<T extends RouteBlueprintCatalog> = {
  [K in keyof T as K & string]: RoutedEvent<K & string, RouteTemplate<T>>
}[keyof T & string];

export type RouteEventByAction<T extends RouteBlueprintCatalog, A extends string> =
  RouteEventUnion<T> extends infer V
    ? V extends { readonly key: `${string}/${A}/${string}`; readonly value: infer M }
      ? V
      : never
    : never;

export type RouteDispatchMap<T extends RouteBlueprintCatalog> = {
  [K in keyof T as `dispatch_${K & string}`]: (event: RouteEventUnion<T> & { readonly key: K }) => T[K]['route'];
};

export const routeLabyrinthCatalog = {
  atlas_bootstrap_node: {
    route: 'atlas/bootstrap/node',
    timeoutMs: 150,
    enabled: true,
  },
  atlas_simulate_incident: {
    route: 'atlas/simulate/incident',
    timeoutMs: 220,
    enabled: true,
  },
  ops_heal_node: {
    route: 'ops/heal/node',
    timeoutMs: 180,
    enabled: true,
  },
  signal_route_channel: {
    route: 'signal/route/channel',
    timeoutMs: 120,
    enabled: false,
  },
  policy_verify_policy: {
    route: 'policy/verify/policy',
    timeoutMs: 500,
    enabled: true,
  },
  control_contain_saga: {
    route: 'control/contain/saga',
    timeoutMs: 250,
    enabled: false,
  },
  control_release_workflow: {
    route: 'control/release/workflow',
    timeoutMs: 320,
    enabled: true,
  },
  control_snapshot_incident: {
    route: 'control/snapshot/incident',
    timeoutMs: 420,
    enabled: true,
  },
} as const satisfies RouteBlueprintCatalog;

export type RouteLabyrinthCatalog = typeof routeLabyrinthCatalog;
export type RouteLabyrinthRoutes = MappedRouteKeys<RouteLabyrinthCatalog>;
export type RouteLabyrinthTemplate = RouteTemplate<RouteLabyrinthCatalog>;
export type RouteLabyrinthEvents = RouteEventUnion<RouteLabyrinthCatalog>;

export type RouteLabyrinthEvent = {
  readonly key: string;
  readonly value: {
    readonly domain: string;
    readonly verb: string;
    readonly identifier: string;
  };
};

export const catalogKeys: ReadonlyArray<keyof RouteLabyrinthCatalog & string> =
  Object.keys(routeLabyrinthCatalog) as ReadonlyArray<keyof RouteLabyrinthCatalog & string>;

export const normalizedCatalog = catalogKeys.reduce((acc, key) => {
  const item = routeLabyrinthCatalog[key];
  const [rawDomain, rawAction, rawEntity] = item.route.split('/');
  const normalized = `${rawDomain.toUpperCase()}/${rawAction.toUpperCase()}/${rawEntity.toUpperCase()}` as const;
  acc[key] = {
    raw: item.route,
    normalized,
    tokens: {
      domain: rawDomain,
      action: rawAction,
      entity: rawEntity,
    },
  };
  return acc;
}, {} as Record<string, { raw: string; normalized: string; tokens: { domain: string; action: string; entity: string } }>);

export const classifyNormalized = (rawRoute: string): string[] => {
  const [domain, action, entity] = rawRoute.split('/');
  return [
    domain.toUpperCase(),
    action.toUpperCase(),
    entity.toUpperCase(),
  ];
};

export const resolveTemplateRoute = (route: string): string => {
  const values = route.split('/');
  if (values.length !== 3) {
    return `${route}::invalid`;
  }
  const [domain, action, entity] = values;
  return `${domain.toLowerCase()}-${action.toLowerCase()}-${entity.toLowerCase()}`;
};

export const renderTemplateManifest = (catalog: RouteLabyrinthCatalog): readonly string[] => {
  return Object.values(catalog)
    .map((entry) => `${entry.route}#${entry.timeoutMs}#${entry.enabled ? 'on' : 'off'}`)
    .toSorted((left, right) => (left < right ? -1 : left > right ? 1 : 0));
};

export const routeLabyrinthEvents: readonly RouteLabyrinthEvent[] = [
  ...Object.entries(routeLabyrinthCatalog).map(([, entry], index) => ({
    key: `route-${String(index).padStart(2, '0')}`,
    value: {
      domain: entry.route.split('/')[0]!,
      verb: entry.route.split('/')[1]!,
      identifier: entry.route.split('/')[2]!,
    },
  })),
] as const;
