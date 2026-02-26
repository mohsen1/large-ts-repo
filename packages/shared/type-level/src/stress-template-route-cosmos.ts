export type EntityToken =
  | 'incident'
  | 'workload'
  | 'recovery'
  | 'continuity'
  | 'timeline'
  | 'forecast'
  | 'risk'
  | 'policy'
  | 'saga'
  | 'fabric'
  | 'signal'
  | 'fleet'
  | 'intent'
  | 'observability'
  | 'audit'
  | 'chronicle'
  | 'runtime'
  | 'mesh'
  | 'canary'
  | 'control'
  | 'incident-archive';

export type ActionToken =
  | 'discover'
  | 'assess'
  | 'repair'
  | 'repair-dry'
  | 'repair-live'
  | 'recover'
  | 'route'
  | 'notify'
  | 'simulate'
  | 'archive'
  | 'verify'
  | 'quiesce';

export type SeverityCode = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'advisory';

export type IdToken =
  | 'R-100'
  | 'R-101'
  | 'R-102'
  | 'R-103'
  | 'R-104'
  | 'R-105'
  | 'R-106'
  | 'R-107'
  | 'R-108'
  | 'R-109'
  | 'R-110'
  | 'R-111'
  | 'R-112'
  | 'R-113'
  | 'R-114';

export type RouteTemplate =
  | `/${EntityToken}/${ActionToken}/${SeverityCode}/${IdToken}`
  | `/${EntityToken}/${ActionToken}/${SeverityCode}/${IdToken}/${'a' | 'b' | 'c'}`
  | `/v2/${EntityToken}/${ActionToken}/${SeverityCode}/${IdToken}/${'dry' | 'live'}`
  | `/v2/${EntityToken}/${ActionToken}/${SeverityCode}/${IdToken}`;

type ParsedRoute<T extends RouteTemplate> = T extends `/v2/${infer E}/${infer A}/${infer S}/${infer I}/${infer M}`
  ? { api: 'v2'; entity: E; action: A; severity: S; id: I; mode: M }
  : T extends `/v2/${infer E}/${infer A}/${infer S}/${infer I}`
    ? { api: 'v2'; entity: E; action: A; severity: S; id: I; mode: 'default' }
    : T extends `/${infer E}/${infer A}/${infer S}/${infer I}/${infer M}`
      ? { api: 'v1'; entity: E; action: A; severity: S; id: I; mode: M }
      : T extends `/${infer E}/${infer A}/${infer S}/${infer I}`
        ? { api: 'v1'; entity: E; action: A; severity: S; id: I; mode: 'default' }
        : never;

export type RouteSignature<T extends RouteTemplate> = T extends `${string}`
  ? ParsedRoute<T> extends infer P
    ? P extends { api: infer Api; entity: infer Entity; action: infer Action; severity: infer Severity; id: infer Id; mode: infer Mode }
      ? `${Api & string}:${Entity & string}:${Action & string}:${Severity & string}:${Id & string}:${Mode & string}`
      : never
    : never
  : never;

export type RouteProjection<T extends RouteTemplate> =
  ParsedRoute<T> extends {
    entity: infer Entity;
    action: infer Action;
    severity: infer Severity;
    id: infer Id;
    mode: infer Mode;
  }
    ? {
      readonly entity: Entity;
      readonly action: Action;
      readonly severity: Severity;
      readonly id: Id;
      readonly mode: Mode;
      readonly domain: DomainProjection<Entity & EntityToken>;
      readonly signature: RouteSignature<T>;
    }
    : never;

export type RouteProjectionByDomain = {
  [K in keyof typeof routeSignatureCatalog]: (typeof routeSignatureCatalog)[K];
};

export type RouteByEntity<T extends EntityToken> = Extract<RouteTemplate, `/${T}/${string}`> | Extract<RouteTemplate, `/v2/${T}/${string}`>;
export type RouteByAction<T extends ActionToken> = Extract<RouteTemplate, `/${string}/${T}/${string}`>;
export type RouteBySeverity<T extends SeverityCode> = Extract<RouteTemplate, `/${string}/${string}/${T}/${string}`>;

export type DispatchDomainMap = {
  incident: 'ops';
  workload: 'analytics';
  recovery: 'fabric';
  continuity: 'fabric';
  timeline: 'observability';
  forecast: 'analytics';
  risk: 'governance';
  policy: 'control';
  saga: 'orchestration';
  fabric: 'orchestration';
  signal: 'telemetry';
  fleet: 'fleet';
  intent: 'intent';
  observability: 'observability';
  audit: 'audit';
  chronicle: 'chronicle';
  runtime: 'engine';
  mesh: 'mesh';
  canary: 'canary';
  control: 'control';
  'incident-archive': 'history';
};

export type DomainProjection<T extends EntityToken> = T extends keyof DispatchDomainMap ? DispatchDomainMap[T] : 'generic';

export type RouteSignatureCatalog = {
  [K in EntityToken]: readonly RouteByEntity<K>[];
};

export const routeSignatureCatalog = {
  incident: [
    '/incident/discover/critical/R-100',
    '/incident/assess/high/R-101',
    '/incident/recover/low/R-102/a',
  ],
  workload: ['/workload/repair/high/R-103', '/workload/route/medium/R-104/live'],
  recovery: ['/recovery/simulate/high/R-105', '/recovery/verify/info/R-106'],
  continuity: ['/continuity/notify/advisory/R-107', '/continuity/archive/low/R-108/c'],
  timeline: ['/timeline/archive/medium/R-109'],
  forecast: ['/forecast/quiesce/info/R-110/b'],
  risk: ['/risk/route/low/R-111'],
  policy: ['/policy/repair-live/high/R-112/a'],
  saga: ['/saga/route/medium/R-113'],
  fabric: ['/fabric/simulate/critical/R-114'],
  signal: ['/signal/recover/low/R-100/a'],
  fleet: ['/fleet/assess/info/R-101'],
  intent: ['/intent/discover/high/R-102'],
  observability: ['/observability/notify/medium/R-103'],
  audit: ['/audit/archive/advisory/R-104'],
  chronicle: ['/chronicle/route/critical/R-105'],
  runtime: ['/runtime/route/high/R-106'],
  mesh: ['/mesh/recover/info/R-107'],
  canary: ['/canary/repair-live/medium/R-108'],
  control: ['/control/verify/high/R-109'],
  'incident-archive': ['/incident-archive/simulate/info/R-110'],
} as const as RouteSignatureCatalog;

export const toRouteSignature = (route: RouteTemplate): string => {
  const parsed = route.split('/') as string[];
  const [ , entity = '', action = '', severity = '', id = '', modeOverride] = parsed;
  const mode = modeOverride ?? 'default';
  return `${entity}:${action}:${severity}:${id}:${mode}`;
};

export const routeProjections: {
  readonly entity: keyof typeof routeSignatureCatalog;
  readonly route: RouteTemplate;
  readonly projection: string;
  readonly domain: string;
}[] = (Object.entries(routeSignatureCatalog) as [
  keyof typeof routeSignatureCatalog,
  readonly RouteTemplate[],
][]).flatMap(([entity, routes]) =>
  routes.map((route) => ({
    entity,
    route,
    projection: toRouteSignature(route),
    domain: entity,
  })),
);
