import type { Brand, PathValue } from './patterns';

export type DomainLexeme =
  | 'api'
  | 'mesh'
  | 'ops'
  | 'pilot'
  | 'recovery'
  | 'signal'
  | 'drill'
  | 'scenario'
  | 'temporal'
  | 'timeline';

export type ActionLexeme =
  | 'start'
  | 'stop'
  | 'pause'
  | 'resume'
  | 'plan'
  | 'sync'
  | 'audit'
  | 'run'
  | 'query'
  | 'emit'
  | 'route'
  | 'open'
  | 'close'
  | 'admit';

export type IdLexeme = string;

export type RouteTemplate = `/${string}/${string}/${string}`;
export type RouteIndex = readonly RouteTemplate[];

export type ParseRoute<T extends RouteTemplate> = T extends `/${infer Domain}/${infer Action}/${infer Id}`
  ? Domain extends DomainLexeme
    ? Action extends ActionLexeme
      ? {
          readonly domain: Domain;
          readonly action: Action;
          readonly id: Id;
        }
      : never
    : never
  : never;

export type RouteTable<T extends RouteIndex> = {
  [K in keyof T]: T[K] extends RouteTemplate ? ParseRoute<T[K]> : never;
};

export type ProjectedRoute<T extends RouteTemplate> = ParseRoute<T> extends {
  readonly domain: infer Domain;
  readonly action: infer Action;
  readonly id: infer Id;
}
  ? `${Domain & string}.${Action & string}.${Id & string}`
  : never;

export type CanonicalRoute<T extends RouteTemplate> = T extends `${infer _Domain}/${infer _Action}/${infer Id}`
  ? `/${Lowercase<_Domain>}/${Uppercase<_Action>}/${Id}`
  : never;

export type RouteUnion =
  | '/api/start/seed-1'
  | '/api/stop/seed-2'
  | '/api/pause/seed-3'
  | '/mesh/run/mesh-10'
  | '/mesh/sync/mesh-11'
  | '/ops/start/ops-12'
  | '/ops/close/ops-13'
  | '/pilot/run/pilot-14'
  | '/pilot/admit/pilot-15'
  | '/recovery/start/rec-16'
  | '/recovery/plan/rec-17'
  | '/recovery/audit/rec-18'
  | '/signal/emit/sig-19'
  | '/signal/query/sig-20'
  | '/drill/run/drill-21'
  | '/drill/route/drill-22'
  | '/scenario/open/scenario-23'
  | '/scenario/query/scenario-24'
  | '/temporal/sync/time-25'
  | '/timeline/close/tl-26';

export type UnionResolver<T extends string> = T extends RouteTemplate
  ? {
      readonly raw: T;
      readonly parsed: ParseRoute<T>;
      readonly canonical: CanonicalRoute<T>;
      readonly projected: ProjectedRoute<T>;
      readonly score: T extends `/${string}/${string}/${infer Id}` ? Id['length'] : 0;
    }
  : never;

export type UnionResolution = UnionResolver<RouteUnion>;
export type UnionResolutionMap = {
  [K in RouteUnion]: UnionResolver<K>;
};

export type RouteFilter<T extends UnionResolutionMap, Q extends string> = {
  [K in keyof T]: T[K] extends { readonly raw: `${string}${Q}${string}` } ? T[K] : never;
};

export type RouteLookup<R extends RouteTemplate> = PathValue<
  UnionResolutionMap,
  `${R extends RouteTemplate ? (R extends `/${infer Domain}/${infer Action}/${infer Id}` ? `${Domain}.${Action}.${Id}` : never) : never}`
>;

export const routeTemplates = [
  '/api/start/seed-1',
  '/api/stop/seed-2',
  '/api/pause/seed-3',
  '/mesh/run/mesh-10',
  '/mesh/sync/mesh-11',
  '/ops/start/ops-12',
  '/ops/close/ops-13',
  '/pilot/run/pilot-14',
  '/pilot/admit/pilot-15',
  '/recovery/start/rec-16',
  '/recovery/plan/rec-17',
  '/recovery/audit/rec-18',
  '/signal/emit/sig-19',
  '/signal/query/sig-20',
  '/drill/run/drill-21',
  '/drill/route/drill-22',
  '/scenario/open/scenario-23',
  '/scenario/query/scenario-24',
  '/temporal/sync/time-25',
  '/timeline/close/tl-26',
] as const satisfies RouteIndex;

export const resolveRouteTemplate = <T extends RouteTemplate>(value: T): ParseRoute<T> => {
  const parts = value.split('/').filter(Boolean);
  if (parts.length !== 3) {
    throw new Error(`Unexpected route ${value}`);
  }

  const parsed = {
    domain: parts[0] as DomainLexeme,
    action: parts[1] as ActionLexeme,
    id: `${parts[2]}` as IdLexeme,
  };
  return parsed as ParseRoute<T>;
};

export const routeProjection = <T extends RouteTemplate>(value: T): ProjectedRoute<T> => {
  const parsed = resolveRouteTemplate(value) as {
    readonly domain: string;
    readonly action: string;
    readonly id: string;
  };
  return `${parsed.domain}.${parsed.action}.${parsed.id}` as ProjectedRoute<T>;
};

export const buildRouteCatalog = (): UnionResolutionMap => {
  const output = Object.fromEntries(
    routeTemplates.map((route) => {
      const parsed = resolveRouteTemplate(route);
      const canonical = `/` + parsed.domain.toLowerCase() + '/' + parsed.action.toUpperCase() + `/${parsed.id}`;
      return [
        route,
        {
          raw: route,
          parsed,
          canonical,
          projected: `${parsed.domain}.${parsed.action}.${parsed.id}`,
          score: route.length,
        },
      ];
    }),
  ) as UnionResolutionMap;
  return output;
};

export const routeCatalog = buildRouteCatalog();

export const queryRouteMap = <Q extends string>(query: Q): UnionResolutionMap =>
  Object.fromEntries(
    Object.entries(routeCatalog).filter(([route]) => route.includes(query)) as [RouteUnion, UnionResolver<RouteUnion>][] ,
  ) as UnionResolutionMap;

export const routeFingerprint = (value: RouteTemplate): Brand<string, 'route-fingerprint'> => {
  const parsed = value.split('/').filter(Boolean) as [string, string, string];
  return `${parsed[0]}:${parsed[1]}:${parsed[2]}` as Brand<string, 'route-fingerprint'>;
};

export const routeDigest = (): readonly Brand<string, 'route-fingerprint'>[] =>
  routeTemplates.map((route) => routeFingerprint(route));
