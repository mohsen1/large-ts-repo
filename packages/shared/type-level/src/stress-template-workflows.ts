import type { NoInfer } from './patterns';

export type EntityName = 'agent' | 'mesh' | 'policy' | 'incident' | 'workload' | 'registry' | 'signal' | 'cluster';
export type ActionName =
  | 'discover'
  | 'ingest'
  | 'materialize'
  | 'validate'
  | 'reconcile'
  | 'synthesize'
  | 'snapshot'
  | 'restore'
  | 'simulate'
  | 'inject'
  | 'amplify'
  | 'throttle'
  | 'rebalance'
  | 'reroute'
  | 'contain'
  | 'recover';
export type SeverityName = 'low' | 'medium' | 'high' | 'critical' | 'emergency';

export type TemplateRoute = `/${ActionName}/${EntityName}/${SeverityName}/${`id-${number}`}`;
export type RouteMatrix = `${ActionName}:${EntityName}:${SeverityName}:${`id-${number}`}`;
export type RouteMap = {
  [A in ActionName]: `${A}:${EntityName}:${SeverityName}:${`id-${number}`}`;
}[ActionName];

export type NormalizeAction<T extends string> = T extends `${infer V}-${infer _}`
  ? V
  : T;

export type ParseRoute<T extends string> = T extends `/${infer V}/${infer D}/${infer S}/${infer I}`
  ? V extends ActionName
    ? D extends EntityName
      ? I extends `id-${number}`
        ? {
            readonly action: V;
            readonly entity: D;
            readonly severity: S & SeverityName;
            readonly id: I;
            readonly segment: `${Uppercase<V>}/${Uppercase<D>}/${Uppercase<S>}`;
          }
        : never
      : never
    : never
  : never;

export type RoutePrefix = `${ActionName | 'audit'}/${EntityName}/${SeverityName}`;

export type BuildRouteFromParsed<T> = T extends {
  readonly action: infer A;
  readonly entity: infer D;
  readonly severity: infer S;
  readonly id: infer I;
}
  ? A extends ActionName
    ? D extends EntityName
      ? S extends SeverityName
        ? I extends `id-${number}`
          ? `/${A}/${D}/${S}/${I}`
          : never
        : never
      : never
    : never
  : never;

export type RouteByVerb<T extends string> = T extends `${infer A}:${infer _}`
  ? A extends ActionName
    ? `${A}:${EntityName}:${SeverityName}:${`id-${number}`}`
    : never
  : never;

export type RouteRecord<T extends ReadonlyArray<string>> = {
  [K in T[number] as K extends `${infer V}:${infer E}:${infer S}:${infer I}`
    ? `${V & string}/${E & string}/${S & string}`
    : never]: K extends `${infer V}:${infer _}`
    ? ParseRoute<`/${K}`>
    : never;
};

export type RemapRoute<T extends Record<string, unknown>> = {
  [K in keyof T as K extends string ? `route:${K}` : never]: T[K] extends string
    ? K extends `route:${string}`
      ? T[K]
      : ParseRoute<`/${K & string}`>
    : T[K];
};

export type PrefixUnion<T> = T extends `${infer A}:${infer _}` ? `${A}:${Uppercase<A>}` : never;

export type RouteInference<T extends readonly string[]> = {
  [K in keyof T]:
    T[K] extends string
      ? ParseRoute<`/${T[K] & string}`>
      : never;
};

export type TemplateError<T extends string> = T extends TemplateRoute
  ? { readonly valid: true; readonly route: T }
  : T extends RouteMap
    ? { readonly valid: true; readonly route: `/${T}` }
    : { readonly valid: false; readonly route: T };

export type TemplateErrors<T extends ReadonlyArray<string>> = {
  [K in keyof T]: TemplateError<T[K] & string>;
};

export type PathEnvelope<T extends string> = ParseRoute<`/${T}`> & {
  readonly canonical: BuildRouteFromParsed<ParseRoute<`/${T}`>>;
  readonly prefix: NoInfer<Extract<ParseRoute<`/${T}`>['action'], string>>;
};

export type RouteEnvelopeMap<T extends ReadonlyArray<string>> = {
  [K in keyof T]: T[K] extends string ? PathEnvelope<T[K]> : never;
};

export const routeTemplates: ReadonlyArray<TemplateRoute> = [
  '/discover/agent/low/id-1',
  '/ingest/mesh/medium/id-2',
  '/materialize/policy/high/id-3',
  '/validate/incident/critical/id-4',
  '/reconcile/registry/emergency/id-5',
  '/synthesize/workload/low/id-6',
  '/snapshot/policy/low/id-7',
  '/restore/agent/medium/id-8',
  '/simulate/signal/high/id-9',
  '/inject/cluster/critical/id-10',
  '/amplify/mesh/high/id-11',
  '/throttle/registry/low/id-12',
  '/rebalance/incident/emergency/id-13',
  '/reroute/agent/medium/id-14',
  '/contain/workload/critical/id-15',
  '/recover/policy/low/id-16',
  '/discover/policy/low/id-17',
  '/validate/cluster/high/id-18',
  '/ingest/workload/medium/id-19',
  '/reconcile/signal/critical/id-20',
] as const;

export const routeEntities = {
  discover: ['agent', 'mesh', 'policy'],
  ingest: ['agent', 'registry', 'incident'],
  materialize: ['workload', 'playbook', 'cluster'],
  validate: ['incident', 'signal', 'recovery'],
  recover: ['agent', 'mesh'],
} as const satisfies Record<string, readonly string[]>;

export type RouteDomainMap = {
  [K in keyof typeof routeEntities]: (typeof routeEntities)[K][number];
};

export type NestedRoutes<T extends ReadonlyArray<string>> = {
  readonly routes: RouteRecord<T>;
  readonly envelopes: RouteInference<T>;
  readonly lookup: RouteEnvelopeMap<T>;
  readonly errors: TemplateErrors<T>;
};

export const parseRouteCatalog = (raw: string): {
  readonly action: string;
  readonly entity: string;
  readonly severity: string;
  readonly id: string;
  readonly asPath: string;
} => {
  const [action, entity, severity, id] = raw.split('/');
  return {
    action: action.replace('/', ''),
    entity,
    severity,
    id,
    asPath: `/routes/${action}/${entity}/${severity}/${id}`,
  };
};

export const routeKeyByParts = <T extends string>(route: T): PrefixUnion<T> => {
  const parts = route.split(':');
  return `${parts[0]}:${parts[0]?.toUpperCase?.()}` as PrefixUnion<T>;
};

export const projectRoutes = <T extends ReadonlyArray<string>>(routes: T): NestedRoutes<T> => {
  const routeRecord = routes.reduce<Record<string, unknown>>((acc, route) => {
    const parsed = parseRouteCatalog(route);
    const key = `${parsed.entity}:${parsed.action}`;
    acc[key] = parsed;
    return acc;
  }, {});

  const envelopes = routes.map((route) => {
    const parsed = parseRouteCatalog(route);
    return {
      action: parsed.action,
      entity: parsed.entity,
      severity: parsed.severity,
      id: parsed.id,
      canonical: `/${parsed.action}/${parsed.entity}/${parsed.severity}/${parsed.id}` as const,
      prefix: parsed.action,
      segment: `${parsed.entity}/${parsed.severity}`,
    } as PathEnvelope<T[number]>;
  }) as RouteInference<T>;

  return {
    routes: routeRecord as RouteRecord<T>,
    envelopes,
    lookup: envelopes as RouteEnvelopeMap<T>,
    errors: routes.map((route) => {
      return typeof route === 'string' && route.includes('://') ? ({ valid: false, route }) : ({ valid: true, route: `/${route}` });
    }) as TemplateErrors<T>,
  };
};
