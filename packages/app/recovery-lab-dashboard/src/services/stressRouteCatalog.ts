import { JsonValue, NoInfer } from '@shared/type-level';
import { mapWithIteratorHelpers } from '@shared/type-level';
import { routeSignature } from '@shared/type-level';
import type { RouteDomain, RouteAction, EventRoute, ParsedRoute } from '@shared/type-level';

type CommandRoute = {
  readonly route: EventRoute;
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
  readonly mode: 'async' | 'sync';
  readonly labels: readonly string[];
  readonly owner: string;
};

export const baseCommandCatalog = [
  { route: '/identity/create/rid-1' as EventRoute, severity: 'high', mode: 'sync', labels: ['identity', 'create'], owner: 'ops' },
  { route: '/policy/activate/rid-2' as EventRoute, severity: 'medium', mode: 'async', labels: ['policy', 'activate'], owner: 'policy' },
  { route: '/catalog/repair/rid-3' as EventRoute, severity: 'critical', mode: 'sync', labels: ['catalog', 'repair'], owner: 'catalog' },
  { route: '/incident/drill/rid-4' as EventRoute, severity: 'low', mode: 'async', labels: ['incident', 'drill'], owner: 'incident' },
  { route: '/telemetry/observe/uuid-tele' as EventRoute, severity: 'medium', mode: 'sync', labels: ['telemetry', 'observe'], owner: 'telemetry' },
  { route: '/workflow/snapshot/uuid-snap' as EventRoute, severity: 'high', mode: 'async', labels: ['workflow', 'snapshot'], owner: 'workflow' },
  { route: '/signal/route/rid-7' as EventRoute, severity: 'low', mode: 'sync', labels: ['signal', 'route'], owner: 'signal' },
  { route: '/playbook/publish/uuid-play' as EventRoute, severity: 'critical', mode: 'async', labels: ['playbook', 'publish'], owner: 'playbook' },
  { route: '/mesh/restore/rid-8' as EventRoute, severity: 'high', mode: 'sync', labels: ['mesh', 'restore'], owner: 'mesh' },
  { route: '/timeline/replay/uuid-tl' as EventRoute, severity: 'low', mode: 'async', labels: ['timeline', 'replay'], owner: 'timeline' },
] satisfies readonly CommandRoute[];

type CommandCatalog = typeof baseCommandCatalog;

type RouteDomainFromEntries<T extends readonly CommandRoute[]> = {
  [Index in keyof T & number]: T[Index] extends { readonly route: infer R extends string }
    ? ParsedRoute<R>
    : never;
};

export type CatalogKeyIndex<T extends readonly string[]> = {
  readonly [K in T[number]]: K;
};

const defaultOwnerConfig = {
  sync: ['ops', 'workflow', 'mesh'],
  async: ['policy', 'incident', 'signal'],
} as const;

export const routeSigners = mapWithIteratorHelpers(baseCommandCatalog, (item) => routeSignature(item.route)) as readonly ((
  input: { domain: string; action: string; id: string },
) => { ok: true; route: EventRoute } | { ok: false; error: string })[];

export const routeOwners: CatalogKeyIndex<readonly string[]> = {
  ops: 'ops',
  workflow: 'workflow',
  mesh: 'mesh',
  policy: 'policy',
  catalog: 'catalog',
  incident: 'incident',
  telemetry: 'telemetry',
  signal: 'signal',
  playbook: 'playbook',
  timeline: 'timeline',
};

export const commandRouteByOwner = (owner: string): readonly EventRoute[] => {
  return baseCommandCatalog.filter((entry) => entry.owner === owner).map((entry) => entry.route);
};

export const routeDomainMap: Readonly<Record<RouteDomain, ReadonlyArray<RouteAction>>> = {
  identity: ['create', 'activate', 'suspend'],
  policy: ['close', 'publish', 'route'],
  catalog: ['snapshot', 'restore', 'replay'],
  incident: ['drill', 'repair', 'observe'],
  telemetry: ['observe', 'snapshot', 'publish'],
  workflow: ['create', 'route', 'close'],
  signal: ['create', 'replay', 'drill'],
  playbook: ['create', 'activate', 'publish'],
  mesh: ['create', 'restore', 'route'],
  timeline: ['create', 'route', 'close'],
};

export const routeTemplatesByDomain = (domain: RouteDomain): readonly EventRoute[] =>
  routeDomainMap[domain].map((action) => `/${domain}/${action}/latest` as EventRoute);

export const domainByRoute = (route: EventRoute): RouteDomain | undefined => {
  const [empty, domain] = route.split('/') as [string, RouteDomain, string, string];
  return domain && domain.length > 0 && routeDomainMap[domain] ? domain : undefined;
};

export const hasOwner = (value: string): value is keyof typeof routeOwners =>
  Object.prototype.hasOwnProperty.call(routeOwners, value);

export const groupedByOwner = mapWithIteratorHelpers(baseCommandCatalog, (entry) => ({
  owner: entry.owner,
  route: entry.route,
  severity: entry.severity,
}));

export const isJsonValue = (value: unknown): value is JsonValue => {
  return (
    value === null ||
    ['string', 'number', 'boolean'].includes(typeof value) ||
    (typeof value === 'object' && value !== null && Object.values(value).every((entry) => isJsonValue(entry)))
  );
};

export const bootstrapRoutes = async () => {
  const map = await Promise.resolve(
    routeCatalogFrom(baseCommandCatalog),
  );
  return map;
};

export const routeCatalogFrom = <T extends CommandCatalog>(entries: NoInfer<T>) => {
  const grouped: Record<string, readonly EventRoute[]> = {};
  for (const entry of entries) {
    const owner = hasOwner(entry.owner) ? entry.owner : 'ops';
    grouped[owner] = [...(grouped[owner] ?? []), entry.route];
  }
  return grouped;
};

export const routeDomains = [
  'identity',
  'policy',
  'catalog',
  'incident',
  'telemetry',
  'workflow',
  'signal',
  'playbook',
  'mesh',
  'timeline',
] as const;

export const catalogByDomain = routeDomains.reduce<Record<RouteDomain, readonly EventRoute[]>>((acc, domain) => {
  acc[domain] = routeDomainMap[domain].map((action) => `/${domain}/${action}/latest` as EventRoute);
  return acc;
}, {} as Record<RouteDomain, readonly EventRoute[]>);

export const catalogHasRoute = (route: EventRoute, domain: RouteDomain): boolean =>
  catalogByDomain[domain]?.includes(route) ?? false;

export const routeLabels = baseCommandCatalog.flatMap((entry) => entry.labels);

export const countRoutes = (routes: readonly EventRoute[]): number => routes.length;
