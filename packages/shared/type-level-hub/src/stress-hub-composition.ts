import type { Brand, NoInfer } from '@shared/type-level';
import { routeEnvelopeMap, stressRouteCatalog, type RouteCatalogUnion } from '@shared/type-level/stress-orchestrator-mesh';
import {
  routeDomainUnion,
  type ParseRouteTemplate,
  type RouteDomainCatalog,
  type RouteTemplateUnion,
} from '@shared/type-level/stress-template-map-recursion';

export type HubConstraint =
  | 'discover'
  | 'route'
  | 'drill'
  | 'synthesize'
  | 'observe'
  | 'validate'
  | 'audit';

type HubRoute = RouteTemplateUnion | RouteCatalogUnion;

export type HubEntry<T extends string, R extends HubRoute> = Readonly<{
  readonly id: Brand<T, 'hub-entry-id'>;
  readonly route: R;
  readonly payload: ParseRouteTemplate<R>;
  readonly allowed: readonly HubConstraint[];
  readonly active: boolean;
}>;

export type HubSignature<T extends readonly HubConstraint[]> = {
  readonly primary: T[number];
  readonly fallback: T[number];
  readonly constraints: T;
  readonly length: T['length'];
};

export type HubScopeCatalog<TEntries extends readonly HubRouteEntry[]> = {
  readonly scopes: ReadonlyMap<Brand<string, 'hub-scope'>, TEntries[number]>;
  readonly keys: readonly (HubRoute | string)[];
  readonly constraints: readonly HubConstraint[];
};

export interface HubRouteEntry {
  readonly route: HubRoute;
  readonly scope: Brand<string, 'hub-scope'>;
  readonly domain: (typeof routeDomainUnion)[number];
  readonly signature: string;
  readonly identity: ReturnType<typeof parseRouteForHub>;
  readonly tags: readonly string[];
}

const makeHubEntry = (route: HubRoute): HubRouteEntry => {
  const [_, domain, verb, mode, severity] = route.split('/');
  const identity = parseRouteForHub(route);
  const scope = `${domain}-${verb}` as Brand<string, 'hub-scope'>;

  return {
    route,
    scope,
    domain: domain as (typeof routeDomainUnion)[number],
    signature: `sig:${route}`,
    identity,
    tags: [domain, verb, mode, severity],
  };
};

const makeEntryMap = (routes: readonly HubRoute[]) => {
  const map = new Map<Brand<string, 'hub-scope'>, HubRouteEntry>();
  for (const route of routes) {
    const entry = makeHubEntry(route);
    map.set(entry.scope, entry);
  }
  return map;
};

export const hubConstraintMap: ReadonlyMap<string, HubSignature<readonly HubConstraint[]>> = new Map([
  ['discover', { primary: 'discover', fallback: 'route', constraints: ['discover', 'route', 'observe'], length: 3 }],
  ['drill', { primary: 'drill', fallback: 'synthesize', constraints: ['drill', 'synthesize', 'validate'], length: 3 }],
  ['observe', { primary: 'observe', fallback: 'validate', constraints: ['observe', 'validate', 'audit'], length: 3 }],
]);

export const buildHubCatalog = (routes: readonly HubRoute[] = stressRouteCatalog): HubScopeCatalog<readonly HubRouteEntry[]> => {
  const map = makeEntryMap(routes);
  const keys: readonly (HubRoute | string)[] = Array.from(map.values()).map((entry) => `${entry.scope}:${entry.route}`);
  const constraints: HubConstraint[] = Array.from(hubConstraintMap.values()).flatMap((entry) => entry.constraints);

  return {
    scopes: map,
    keys,
    constraints,
  };
};

export const hubCatalog = buildHubCatalog(stressRouteCatalog);

export type HubRouteProjection = {
  readonly scope: Brand<string, 'hub-scope'>;
  readonly route: HubRoute;
  readonly profile: ReturnType<typeof parseRouteForHub>;
};

export const collectHubProjections = (
  catalog: HubScopeCatalog<readonly HubRouteEntry[]>,
): readonly HubRouteProjection[] => {
  const result: HubRouteProjection[] = [];
  for (const [scope, entry] of catalog.scopes) {
    result.push({
      scope,
      route: entry.route,
      profile: entry.identity,
    });
  }
  return result;
};

export const hubProjections = collectHubProjections(hubCatalog);

export const assertNoOverlap = (left: readonly HubRouteEntry[], right: readonly HubRouteEntry[]) => {
  const overlap = left.filter((candidate) => right.some((entry) => entry.route === candidate.route));
  if (overlap.length > 0) {
    const message = `overlapping routes: ${overlap.map((route) => route.route).join(', ')}`;
    throw new Error(message);
  }
};

export const withHubCatalog = async <TResult>(
  routes: readonly HubRoute[],
  handler: (entries: readonly HubRouteProjection[]) => Promise<TResult>,
): Promise<TResult> => {
  const catalog = buildHubCatalog(routes);
  const projections = collectHubProjections(catalog);

  await using scope = {
    [Symbol.asyncDispose]: async () => {
      await Promise.resolve();
    },
  };

  return handler(projections);
};

export const runHubProjection = () => {
  const projections = hubProjections;
  const domainCatalog = routeDomainUnion.reduce((acc, domain) => {
    const route = `${domain}/dispatch/live/high` as const;
    const entry = {
      domain,
      route,
      aliases: { short: `${domain}-alias`, canonical: `/${domain}/` },
    };
    (acc as Record<string, typeof entry>)[domain] = entry as typeof entry;
    return acc;
  }, {} as Partial<RouteDomainCatalog> as RouteDomainCatalog);

  return {
    projectionCount: projections.length,
    constraints: hubConstraintMap.size,
    domainCatalog,
  };
};

export const typedCatalog = runHubProjection();

const allEntries: HubRouteEntry[] = Array.from(hubCatalog.scopes.values());
const firstHalf = allEntries.slice(0, allEntries.length / 2);
const secondHalf = allEntries.slice(allEntries.length / 2);

assertNoOverlap(firstHalf, secondHalf);

export const projectedRouteSignatures = Array.from(routeEnvelopeMap.values()).map(
  (entry) => `${entry.resolved.normalized}-${entry.resolved.parse.entity}` as Brand<string, 'route-signature'>,
);

const identityMatches = projectedRouteSignatures.map(
  (signature) => signature.startsWith('a') || signature.includes('/'),
);

export type HubDiscriminator<T extends Brand<string, 'hub-scope'>> = T extends `_${string}`
  ? 'private'
  : T extends `${string}-audit`
    ? 'auditor'
    : 'public';

export const scopeBuckets = hubProjections.reduce(
  (acc, projection) => {
    const bucket = projection.route.includes('live') ? 'live' : 'sim';
    acc[bucket] ??= [];
    acc[bucket].push(projection);
    return acc;
  },
  {} as { [bucket: string]: HubRouteProjection[] },
);

const validateConstraint = <T extends HubConstraint>(input: NoInfer<T>): HubRoute[] => {
  const item = hubConstraintMap.get(input as string);
  if (!item) {
    return [];
  }
  return [...stressRouteCatalog] as HubRoute[];
};

export const constraintsForDiscover = validateConstraint('discover');
export const constraintsForDrill = validateConstraint('drill');

const parseRouteForHub = <T extends HubRoute>(route: T): ParseRouteTemplate<T> => {
  const [_, domain, verb, mode, severity] = route.split('/') as [string, string, string, string, string];
  return {
    domain,
    verb,
    mode,
    severity,
  } as ParseRouteTemplate<T>;
};
