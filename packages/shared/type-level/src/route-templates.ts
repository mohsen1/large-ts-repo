export type RouteDomain =
  | 'identity'
  | 'policy'
  | 'catalog'
  | 'incident'
  | 'telemetry'
  | 'workflow'
  | 'signal'
  | 'playbook'
  | 'mesh'
  | 'timeline';

export type RouteAction =
  | 'create'
  | 'activate'
  | 'suspend'
  | 'repair'
  | 'drill'
  | 'observe'
  | 'close'
  | 'publish'
  | 'snapshot'
  | 'restore'
  | 'route'
  | 'replay';

export type RouteId = `rid-${number}` | `uuid-${string}` | 'latest';

export type EventRoute = `/${RouteDomain}/${RouteAction}/${RouteId}`;

export type RouteUnion =
  | `/${RouteDomain}/create/${RouteId}`
  | `/${RouteDomain}/activate/${RouteId}`
  | `/${RouteDomain}/suspend/${RouteId}`
  | `/${RouteDomain}/repair/${RouteId}`
  | `/${RouteDomain}/drill/${RouteId}`
  | `/${RouteDomain}/observe/${RouteId}`
  | `/${RouteDomain}/close/${RouteId}`
  | `/${RouteDomain}/publish/${RouteId}`
  | `/${RouteDomain}/snapshot/${RouteId}`
  | `/${RouteDomain}/restore/${RouteId}`
  | `/${RouteDomain}/route/${RouteId}`
  | `/${RouteDomain}/replay/${RouteId}`;

export type RouteParams<T extends EventRoute> = T extends `/${infer D}/${infer A}/${infer I}`
  ? D extends RouteDomain
    ? A extends RouteAction
      ? I extends RouteId
        ? { domain: D; action: A; id: I }
        : never
      : never
    : never
  : never;

export type RouteSignature<T extends EventRoute> =
  RouteParams<T> extends infer P
    ? P extends { readonly domain: infer D; readonly action: infer A; readonly id: infer I }
      ? (input: { domain: D; action: A; id: I }) => { ok: true; route: T } | { ok: false; error: string }
      : never
    : never;

export type RouteMatrix<T extends RouteDomain> = {
  [A in RouteAction]: (readonly [EventRoute, RouteSignature<EventRoute>])[];
} & {
  domain: T;
};

export type RouteBranch<T extends EventRoute, TState extends string = 'init'> =
  T extends `/${infer D}/${infer A}/${infer I}`
    ? A extends 'create'
      ? { domain: D; state: 'created'; action: A; id: I }
      : A extends 'activate'
        ? { domain: D; state: 'active'; action: A; id: I }
        : A extends 'suspend'
          ? { domain: D; state: 'suspended'; action: A; id: I }
          : A extends 'repair'
            ? { domain: D; state: 'repaired'; action: A; id: I }
            : A extends 'drill'
              ? { domain: D; state: 'drilled'; action: A; id: I }
              : A extends 'observe'
                ? { domain: D; state: 'observed'; action: A; id: I }
                : A extends 'close'
                  ? { domain: D; state: 'closed'; action: A; id: I }
                  : A extends 'publish'
                    ? { domain: D; state: 'published'; action: A; id: I }
                    : A extends 'snapshot'
                      ? { domain: D; state: 'snapshotted'; action: A; id: I }
                      : A extends 'restore'
                        ? { domain: D; state: 'restored'; action: A; id: I }
                        : A extends 'route'
                          ? { domain: D; state: 'routed'; action: A; id: I }
                          : A extends 'replay'
                            ? { domain: D; state: 'replayed'; action: A; id: I }
                            : never
    : never;

export type RouteRoute<T extends EventRoute> = T extends `${infer Prefix}/${infer D}/${infer A}/${infer I}`
  ? {
      readonly key: `${Prefix}-${D}`;
      readonly domain: D;
      readonly action: A;
      readonly id: I;
    }
  : never;

export type RouteRouteByDomain<T extends RouteDomain> = {
  [K in RouteAction]: RouteRoute<`/${T}/${K}/latest`>;
};

export const routeTemplates = {
  create: '/:domain/create/:id',
  activate: '/:domain/activate/:id',
  suspend: '/:domain/suspend/:id',
  repair: '/:domain/repair/:id',
  drill: '/:domain/drill/:id',
  observe: '/:domain/observe/:id',
  close: '/:domain/close/:id',
  publish: '/:domain/publish/:id',
  snapshot: '/:domain/snapshot/:id',
  restore: '/:domain/restore/:id',
  route: '/:domain/route/:id',
  replay: '/:domain/replay/:id',
} as const;

export const routeMap = {
  identity: ['/identity/create', '/identity/activate', '/identity/suspend'] as const,
  policy: ['/policy/create', '/policy/activate', '/policy/close'] as const,
  catalog: ['/catalog/create', '/catalog/restore', '/catalog/replay'] as const,
  incident: ['/incident/create', '/incident/repair', '/incident/observe'] as const,
  telemetry: ['/telemetry/observe', '/telemetry/snapshot', '/telemetry/publish'] as const,
  workflow: ['/workflow/create', '/workflow/route', '/workflow/close'] as const,
  signal: ['/signal/create', '/signal/replay', '/signal/drill'] as const,
  playbook: ['/playbook/create', '/playbook/activate', '/playbook/publish'] as const,
  mesh: ['/mesh/create', '/mesh/restore', '/mesh/route'] as const,
  timeline: ['/timeline/create', '/timeline/route', '/timeline/close'] as const,
} as const;

export type ParsedRoute<T extends string> = T extends `/${infer Domain}/${infer Action}/${infer Id}`
  ? {
      readonly domain: Domain;
      readonly action: Action;
      readonly id: Id;
    }
  : never;

export const parseRoute = <T extends string>(value: T): ParsedRoute<T> => {
  const [empty, domain, action, id] = value.split('/') as [string, string, string, string];
  void empty;
  return {
    domain,
    action,
    id,
  } as ParsedRoute<T>;
};

export const routeSignature = <T extends EventRoute>(value: T): RouteSignature<T> => {
  const payload = parseRoute(value);
  return ((input: ParsedRoute<T>) => {
    if (input.domain !== payload.domain || input.action !== payload.action || input.id !== payload.id) {
      return { ok: false, error: `invalid ${value}` };
    }
    return { ok: true, route: value };
  }) as RouteSignature<T>;
};

const routeActions = [
  'create',
  'activate',
  'suspend',
  'repair',
  'drill',
  'observe',
  'close',
  'publish',
  'snapshot',
  'restore',
  'route',
  'replay',
] as const;

export const routeFromCatalog = <TDomain extends RouteDomain>(domain: TDomain): RouteRouteByDomain<TDomain> => {
  const source = Object.fromEntries(
    routeActions.map((action) => {
      const route = `/${domain}/${action}/latest` as const;
      return [
        action,
        {
          key: `/${domain}-${action}`,
          domain,
          action,
          id: 'latest',
        } as RouteRoute<typeof route>,
      ];
    }),
  ) as unknown as RouteRouteByDomain<TDomain>;

  return source;
};
