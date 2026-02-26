export type NexusDomain =
  | 'auth'
  | 'billing'
  | 'catalog'
  | 'continuity'
  | 'dashboard'
  | 'edge'
  | 'fleet'
  | 'governance'
  | 'incident'
  | 'intake'
  | 'inventory'
  | 'lattice'
  | 'mesh'
  | 'ops'
  | 'playbook'
  | 'orchestrator'
  | 'policy'
  | 'quantum'
  | 'chronicle'
  | 'recovery'
  | 'risk'
  | 'safety'
  | 'service'
  | 'signal'
  | 'simulation'
  | 'saga'
  | 'telemetry'
  | 'timeline';

export type NexusAction =
  | 'align'
  | 'assess'
  | 'authorize'
  | 'checkpoint'
  | 'connect'
  | 'deploy'
  | 'dispatch'
  | 'discover'
  | 'escalate'
  | 'observe'
  | 'notify'
  | 'patch'
  | 'queue'
  | 'recover'
  | 'release'
  | 'repair'
  | 'reroute'
  | 'route'
  | 'run'
  | 'seal'
  | 'simulate'
  | 'sync'
  | 'suspend'
  | 'verify'
  | 'watch';

export type NexusSeverity = 'advisory' | 'critical' | 'degraded' | 'emergency' | 'high' | 'low' | 'normal' | 'notice' | 'severe';

export type NexusVersion = 'v1' | 'v2' | 'v3' | 'v4' | 'v5';
export type NexusId = `${string}_${string}`;
export type NexusRoute = `/${NexusDomain}/${NexusAction}/${NexusSeverity}/${NexusVersion}/${NexusId}`;

export type BuildTuple<TSize extends number, TAcc extends readonly unknown[] = []> = TAcc['length'] extends TSize
  ? TAcc
  : BuildTuple<TSize, readonly [...TAcc, unknown]>;

export type Decrement<Depth extends number> = BuildTuple<Depth> extends readonly [unknown, ...infer Rest] ? Rest['length'] : 0;

export const routeSeeds = [
  '/incident/discover/advisory/v1/id_01',
  '/incident/assess/high/v1/id_02',
  '/incident/route/critical/v2/id_03',
  '/recovery/recover/emergency/v3/id_04',
  '/recovery/repair/severe/v1/id_05',
  '/policy/notify/high/v4/id_06',
  '/mesh/sync/low/v1/id_07',
  '/timeline/observe/degraded/v2/id_09',
  '/risk/verify/critical/v1/id_10',
  '/ops/dispatch/severe/v5/id_11',
  '/ops/dispatch/high/v2/id_12',
  '/service/watch/normal/v1/id_13',
  '/quantum/route/low/v2/id_14',
  '/simulation/simulate/notice/v3/id_15',
  '/auth/release/degraded/v1/id_16',
  '/playbook/recover/critical/v2/id_17',
  '/lattice/deploy/low/v1/id_18',
  '/chronicle/assess/high/v1/id_19',
  '/signal/observe/severe/v3/id_20',
  '/service/align/high/v1/id_21',
  '/safety/checkpoint/emergency/v2/id_22',
  '/risk/suspend/normal/v3/id_23',
  '/simulation/patch/notice/v4/id_24',
  '/telemetry/queue/low/v1/id_25',
  '/timeline/watch/normal/v2/id_26',
  '/ops/recover/high/v1/id_27',
  '/orchestrator/route/critical/v2/id_28',
  '/incident/seal/high/v2/id_29',
  '/recovery/simulate/notice/v1/id_30',
  '/policy/deploy/normal/v1/id_31',
  '/saga/authorize/severe/v1/id_32',
] as const satisfies readonly NexusRoute[];

export type RouteTuple = typeof routeSeeds;
export type NexusRouteUnion = RouteTuple[number];

export type RouteProfile<T extends NexusRouteUnion> = {
  readonly route: T;
  readonly domain: string & { readonly __brand: 'nexus-domain' };
  readonly action: string & { readonly __brand: 'nexus-action' };
  readonly severity: string & { readonly __brand: 'nexus-severity' };
  readonly version: string & { readonly __brand: 'nexus-version' };
  readonly id: string & { readonly __brand: 'nexus-id' };
  readonly score: number;
};

export type ResolveNexusRoute<T extends NexusRouteUnion> = RouteProfile<T> & {
  readonly resolved: `resolved/${string}/${string}`;
  readonly phase: 'analysis' | 'remediation' | 'verification' | 'communication' | 'routing';
  readonly risk: 'high' | 'medium' | 'low';
};

export type RouteProfileMap<T extends readonly NexusRouteUnion[]> = {
  readonly [K in keyof T]: T[K] extends NexusRouteUnion ? ResolveNexusRoute<T[K]> : never;
};

type RouteByDomain<T extends readonly NexusRouteUnion[]> = {
  [K in NexusDomain]?: Record<string, T[number]>;
};

export type NexusProfile<T extends readonly NexusRouteUnion[]> = {
  readonly routes: T;
  readonly domains: readonly NexusDomain[];
  readonly byDomain: RouteByDomain<T>;
  readonly profile: RouteProfileMap<T>;
  readonly totalRoutes: T['length'];
};

export const parseNexusRoute = <T extends NexusRouteUnion>(route: T): RouteProfile<T> => {
  const [, domain, action, severity, version, id] = route.split('/');
  return {
    route,
    domain: domain as RouteProfile<T>['domain'],
    action: action as RouteProfile<T>['action'],
    severity: severity as RouteProfile<T>['severity'],
    version: version as RouteProfile<T>['version'],
    id: id as RouteProfile<T>['id'],
    score: (domain.length + action.length + severity.length + version.length + id.length) % 9,
  };
};

export const classifyRoutePhase = <T extends NexusRouteUnion>(route: T): ResolveNexusRoute<T>['phase'] => {
  if (route.includes('/recover/') || route.includes('/repair/') || route.includes('/route/') || route.includes('/dispatch/')) {
    return 'remediation';
  }
  if (route.includes('/verify/') || route.includes('/release/')) {
    return 'verification';
  }
  if (route.includes('/notify/') || route.includes('/patch/') || route.includes('/seal/')) {
    return 'communication';
  }
  if (route.includes('/connect/') || route.includes('/reroute/') || route.includes('/route/')) {
    return 'routing';
  }
  return 'analysis';
};

export const classifyRouteRisk = <T extends NexusRouteUnion>(route: T): ResolveNexusRoute<T>['risk'] => {
  if (route.includes('/critical/') || route.includes('/emergency/') || route.includes('/high/')) {
    return 'high';
  }
  if (route.includes('/severe/') || route.includes('/degraded/')) {
    return 'medium';
  }
  return 'low';
};

export const resolveNexusRoute = <T extends NexusRouteUnion>(route: T): ResolveNexusRoute<T> => {
  const profile = parseNexusRoute(route);
  return {
    ...profile,
    resolved: `resolved/${profile.domain as string}/${profile.severity as string}` as const,
    phase: classifyRoutePhase(route),
    risk: classifyRouteRisk(route),
  };
};

export const buildNexusProfile = <T extends readonly NexusRouteUnion[]>(routes: T): NexusProfile<T> => {
  const byDomain: RouteByDomain<T> = {};
  const domains: NexusDomain[] = [];
  const seen = new Set<NexusDomain>();
  const profile = routes.map((route) => resolveNexusRoute(route)) as unknown as RouteProfileMap<T>;
  for (const route of routes) {
    const domain = route.split('/')[1] as NexusDomain;
    if (!seen.has(domain)) {
      seen.add(domain);
      domains.push(domain);
    }
    byDomain[domain] = {
      ...(byDomain[domain] ?? {}),
      [route]: route,
    };
  }
  return {
    routes,
    domains,
    byDomain,
    profile,
    totalRoutes: routes.length,
  };
};

export type RouteChain<T extends NexusRouteUnion> = {
  readonly route: T;
  readonly profile: RouteProfile<T>;
  readonly depth: number;
  readonly next?: RouteChain<T>;
};

export const routeMap = buildNexusProfile(routeSeeds);

export const classifyRouteFamily = <T extends RouteTuple>(catalog: T) => {
  const out: Record<string, ResolveNexusRoute<NexusRouteUnion>> = {};
  for (const route of catalog) {
    out[route] = resolveNexusRoute(route);
  }
  return out;
};

export const routeChain = <T extends NexusRouteUnion>(route: T, depth: number = 6): RouteChain<T> => {
  const profile = parseNexusRoute(route);
  if (depth <= 0) {
    return { route, profile, depth: 0 };
  }
  return {
    route,
    profile,
    depth,
    next: routeChain(route, depth - 1),
  };
};

export const routeProfiles = routeSeeds.map((route) => resolveNexusRoute(route));

export const domainProfileIndex = (catalog: RouteTuple) => {
  const out: Record<NexusDomain, number> = Object.fromEntries(
    routeSeeds.map((route) => [route.split('/')[1] as NexusDomain, 0]),
  ) as Record<NexusDomain, number>;
  for (const route of catalog) {
    const [_, domain] = route.split('/');
    out[domain as NexusDomain] = (out[domain as NexusDomain] ?? 0) + 1;
  }
  return out;
};

export type RouteChainEnvelope = {
  readonly route: NexusRoute;
  readonly profile: RouteProfile<NexusRouteUnion>;
  readonly chain: RouteChain<NexusRouteUnion>;
};

export const describeRouteSeed = <T extends NexusRouteUnion>(route: T) => resolveNexusRoute(route);

export const routeProfilesByDomain = routeProfiles.reduce<Record<string, ResolveNexusRoute<NexusRouteUnion>>>(
  (acc, profile) => {
  acc[profile.route] = profile;
  return acc;
  },
  {},
);
