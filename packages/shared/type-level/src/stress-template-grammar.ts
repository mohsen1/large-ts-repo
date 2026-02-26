export type Branded<T, B extends string> = T & { readonly __brand: B };

export type EventDomain =
  | 'auth'
  | 'billing'
  | 'catalog'
  | 'fleet'
  | 'incident'
  | 'lifecycle'
  | 'mesh'
  | 'policy'
  | 'recovery'
  | 'telemetry'
  | 'workflow';

export type EventVerb = 'activate' | 'build' | 'dispatch' | 'observe' | 'query' | 'replay' | 'route' | 'run' | 'simulate' | 'sync' | 'validate' | 'repair' | 'recover' | 'execute' | 'snapshot' | 'scan';

export type EventStatus = 'new' | 'received' | 'queued' | 'executing' | 'completed' | 'failed' | 'suspended' | 'approved';

export type EventContext = 'tenant' | 'fleet' | 'zone' | 'region' | 'workspace' | 'node';

export type EventRoute =
  | `${EventDomain}/${EventVerb}/${EventStatus}/${EventContext}`
  | `${EventDomain}/${EventVerb}/${EventStatus}`
  | `${EventDomain}/${EventVerb}`
  | EventDomain;

export type EventEnvelope<T extends EventRoute> = T extends `${infer TDomain}/${infer TVerb}/${infer TStatus}/${infer TContext}`
  ? {
      readonly domain: TDomain & EventDomain;
      readonly verb: TVerb & EventVerb;
      readonly status: TStatus & EventStatus;
      readonly context: TContext & EventContext;
      readonly kind: 'full';
      readonly token: `token-${Uppercase<TDomain & EventDomain>}`;
    }
  : {
      readonly domain: T & EventDomain;
      readonly verb: EventVerb;
      readonly status: EventStatus;
      readonly context: EventContext;
      readonly kind: 'leaf';
      readonly token: `token-${Uppercase<T & EventDomain>}`;
    };

export type EventKey<T extends EventRoute> = T extends `${infer D}/${infer A}/${infer S}/${infer C}`
  ? `${D}/${Uppercase<A>}/${Uppercase<S>}/${Uppercase<C>}`
  : `leaf/${Uppercase<T>}`;

export type RouteSet<T extends readonly EventRoute[]> = {
  [K in keyof T]: T[K] extends EventRoute ? EventEnvelope<T[K]> : never;
};

export type RouteSetUnion<T extends readonly EventRoute[]> = RouteSet<T>[number];

export type RouteBucket<T extends readonly EventRoute[]> = {
  [K in keyof T as K & string]: T[K] extends EventRoute ? EventKey<T[K]> : never;
};

export type TemplateStringTuple<T extends readonly string[]> = T extends readonly [infer Head, ...infer Rest]
  ? Head extends string
    ? Rest extends readonly string[]
      ? readonly [`${Uppercase<Head>}`, ...TemplateStringTuple<Rest>]
      : readonly [`${Uppercase<Head>}`]
    : readonly []
  : readonly [];

export type InferTemplateTokens<T extends string> = T extends `${infer Left}/${infer Right}`
  ? readonly [Left, ...InferTemplateTokens<Right>]
  : T extends `${infer Left}`
    ? readonly [Left]
    : readonly [];

export type NormalizedTemplate<T extends string> = InferTemplateTokens<T>[number] extends never
  ? never
  : InferTemplateTokens<T>[number];

export type EventTemplateMap<T extends Record<string, EventRoute>> = {
  [K in keyof T as K & string]: T[K] extends EventRoute
    ? {
        readonly route: T[K];
        readonly normalized: NormalizedTemplate<T[K]>;
        readonly envelope: EventEnvelope<T[K]>;
      }
    : never;
};

export type RouteUnionMap<T extends EventRoute[]> = {
  [K in keyof T as T[K] extends EventRoute ? K & string : never]: T[K] extends EventRoute ? EventEnvelope<T[K]> : never;
};

export type RouteConstraints<A extends EventDomain, B extends EventVerb> = {
  readonly domain: A;
  readonly verb: B;
  readonly scopes: [A, B, 'default'];
};

type EventRouteDictionary<T extends readonly EventRoute[]> = {
  [I in keyof T as `event-${I & string}`]: T[I] & EventRoute;
};

export type RouteTemplateMap<T extends readonly EventRoute[]> = EventTemplateMap<EventRouteDictionary<T>>;

export const eventLiterals = {
  eventA: 'incident/recover/received/tenant',
  eventB: 'workflow/execute/executing/region',
  eventC: 'recovery/simulate/completed/workspace',
  eventD: 'mesh/sync/queued/zone',
  eventE: 'policy/validate/approved/node',
  eventF: 'catalog/query/new/node',
  eventG: 'fleet/build/failed/fleet',
  eventH: 'telemetry/scan/suspended/node',
  eventI: 'workflow/snapshot/completed/tenant',
  eventJ: 'fleet/repair/completed/tenant',
} as const;

export type RouteTemplateCatalog = typeof eventLiterals;
export const routeTemplateCatalog: RouteTemplateCatalog = eventLiterals;

export const eventTemplateCatalog = [...Object.values(eventLiterals)] as const satisfies readonly EventRoute[];
export const routeCatalog = buildEventTemplateMap(eventTemplateCatalog);

export const routeTemplateBuckets = {
  catalog: routeCatalog,
  constraints: {
    incidentRun: {
      domain: 'incident',
      verb: 'run',
      scopes: ['incident', 'run', 'default'] as const,
    } satisfies RouteConstraints<'incident', 'run'>,
    fabricSync: {
      domain: 'fleet',
      verb: 'sync',
      scopes: ['fleet', 'sync', 'default'] as const,
    } satisfies RouteConstraints<'fleet', 'sync'>,
  },
} as const;

export const parseEventRoute = <T extends EventRoute>(route: T): EventEnvelope<T> => {
  const [domain, verb, status, context] = route.split('/') as [
    string,
    string | undefined,
    string | undefined,
    string | undefined,
  ];
  return {
    domain: (domain as EventDomain) ?? 'auth',
    verb: (verb as EventVerb) ?? 'run',
    status: (status as EventStatus) ?? 'new',
    context: (context as EventContext) ?? 'tenant',
    kind: context ? 'full' : 'leaf',
    token: `token-${domain.toUpperCase()}` as `token-${Uppercase<EventDomain>}`,
  } as EventEnvelope<T>;
};

export function buildEventTemplateMap<T extends readonly EventRoute[]>(routes: T): RouteSet<T> {
  return routes.map((route) => parseEventRoute(route)) as unknown as RouteSet<T>;
}

export type RouteCatalogMetadata = {
  readonly brand: Branded<'event-catalog', 'RouteCatalog'>;
  readonly schema: 'v1';
};

export const routeTemplateMap = buildEventTemplateMap(eventTemplateCatalog) as unknown as RouteTemplateMap<typeof eventTemplateCatalog>;
