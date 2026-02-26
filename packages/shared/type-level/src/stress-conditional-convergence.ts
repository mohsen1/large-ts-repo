export const routeDomains = ['fleet', 'mesh', 'runtime', 'orbit', 'signal', 'recovery', 'ops', 'ledger', 'telemetry', 'audit', 'policy'] as const;
export const routeVerbs = ['create', 'read', 'update', 'delete', 'execute', 'route', 'dispatch', 'hydrate', 'dehydrate', 'bind', 'release', 'escalate', 'rollback', 'scan', 'publish', 'ingest', 'observe'] as const;
export const routeEntities = [
  'actor',
  'cluster',
  'stream',
  'ledger',
  'policy',
  'incident',
  'telemetry',
  'trace',
  'command',
  'payload',
  'snapshot',
  'intent',
  'signal',
  'resource',
  'timeline',
  'outcome',
  'entity',
  'rule',
] as const;

export type RouteDomain = (typeof routeDomains)[number];
export type RouteVerb = (typeof routeVerbs)[number];
export type RouteEntity = (typeof routeEntities)[number];
export type RouteTuple = `${RouteDomain}/${RouteVerb}/${RouteEntity}`;
export type RouteCatalog = readonly RouteTuple[];

export type RouteSegmentTuple<T extends RouteTuple> = T extends `${infer D}/${infer A}/${infer E}`
  ? {
      readonly domain: D & RouteDomain;
      readonly verb: A & RouteVerb;
      readonly entity: E & RouteEntity;
    }
  : never;

type SegmentActionMap = 'critical' | 'high' | 'medium' | 'low';

type DomainSeverityBranch<D extends string, A extends string, E extends string> = D extends 'fleet'
  ? A extends 'create' | 'update' | 'delete'
    ? 'medium'
    : A extends 'read' | 'scan'
      ? E extends 'resource' | 'timeline'
        ? 'low'
        : 'medium'
      : A extends 'execute' | 'route'
        ? E extends 'command' | 'incident'
          ? 'high'
          : 'critical'
        : A extends 'dispatch' | 'publish'
          ? E extends 'signal' | 'telemetry'
            ? 'critical'
            : 'high'
          : A extends 'bind' | 'release'
            ? 'low'
            : A extends 'rollback' | 'escalate'
              ? 'high'
              : 'medium'
  : D extends 'mesh'
    ? A extends 'bind' | 'dispatch' | 'route'
      ? 'high'
      : A extends 'execute' | 'publish'
        ? E extends 'signal' | 'incident'
          ? 'critical'
          : 'high'
        : A extends 'read' | 'scan'
          ? 'medium'
          : D extends 'mesh'
            ? 'low'
            : 'medium'
    : D extends 'runtime'
      ? A extends 'execute' | 'hydrate' | 'dehydrate'
        ? 'critical'
        : A extends 'observe' | 'scan' | 'read'
          ? 'low'
          : A extends 'rollback' | 'release'
            ? 'high'
            : 'medium'
      : D extends 'orbit'
        ? A extends 'route' | 'dispatch'
          ? 'critical'
          : A extends 'publish' | 'observe'
            ? 'high'
            : A extends 'create' | 'read'
              ? 'medium'
              : 'low'
        : D extends 'signal'
          ? A extends 'bind' | 'execute'
            ? 'high'
            : A extends 'publish' | 'dispatch'
              ? 'critical'
              : 'medium'
          : D extends 'recovery'
            ? A extends 'rollback' | 'escalate' | 'release'
              ? 'critical'
              : A extends 'execute' | 'route'
                ? 'high'
                : 'medium'
            : D extends 'ops'
              ? A extends 'create' | 'hydrate'
                ? 'medium'
                : A extends 'scan' | 'read'
                  ? 'low'
                  : A extends 'execute' | 'escalate'
                    ? 'critical'
                    : 'high'
              : D extends 'ledger'
                ? A extends 'update' | 'delete' | 'snapshot'
                  ? 'high'
                  : A extends 'create' | 'read'
                    ? 'medium'
                    : 'low'
                : D extends 'telemetry'
                  ? A extends 'observe' | 'publish' | 'scan'
                    ? 'low'
                    : A extends 'execute' | 'dispatch'
                      ? 'critical'
                      : 'medium'
                  : D extends 'audit'
                    ? A extends 'route' | 'read' | 'scan'
                      ? 'low'
                      : 'high'
                    : 'medium';

export type RouteSeverity<T extends RouteTuple> = T extends `${infer D}/${infer A}/${infer E}`
  ? RouteSegmentTuple<T> extends {
      readonly domain: D & string;
      readonly verb: A & string;
      readonly entity: E & string;
    }
    ? DomainSeverityBranch<D & RouteDomain, A & RouteVerb, E & RouteEntity>
    : 'low'
  : 'low';

type ChainPolicy<T extends RouteTuple> = T extends `${infer Domain}/${infer Verb}/${infer Entity}`
  ? Domain extends 'fleet'
    ? Verb extends 'route' | 'dispatch'
      ? 'control-plane'
      : 'workflow'
    : Domain extends 'mesh'
      ? Verb extends 'bind' | 'release'
        ? 'fabric'
        : 'signal'
      : Domain extends 'runtime'
        ? Verb extends 'observe' | 'scan'
          ? 'introspection'
          : 'execution'
        : Domain extends 'orbit'
          ? 'coordination'
          : 'general'
  : 'general';

export type RoutePolicy<T extends RouteTuple> = RouteSeverity<T> extends infer Severity
  ? {
      readonly severity: Severity;
      readonly policy: ChainPolicy<T>;
      readonly requiresRollback: Severity extends 'critical' ? true : false;
    }
  : never;

export type RouteEnvelope<T extends RouteTuple, TPayload extends Record<string, unknown>> = {
  readonly route: T;
  readonly routeParts: RouteSegmentTuple<T>;
} & {
  readonly policy: RoutePolicy<T>;
} & {
  readonly payload: {
    readonly schema: `v-${T['length']}`;
    readonly data: TPayload;
    readonly issuedAt: Date;
  };
};

export type MapValuesByDomain<T> = {
  [K in keyof T as K & string]: {
    [P in keyof T[K] & string as `${Uppercase<K & string>}_${P}`]: T[K][P];
  };
};

export type RemappedRouteMap<T extends Record<string, Record<string, unknown>>> = {
  [Zone in keyof T as `${Zone & string}::zone`]: {
    [Lane in keyof T[Zone] as `lane_${Lane & string}`]: T[Zone][Lane] extends string
      ? `slot:${Lane & string}`
      : T[Zone][Lane] extends number
        ? `weight:${Lane & string}`
        : `payload:${Lane & string}`;
  };
};

export const orbitalTemplateCatalog: readonly RouteTuple[] = [
  'fleet/create/actor',
  'fleet/execute/command',
  'fleet/read/resource',
  'fleet/scan/trace',
  'mesh/bind/actor',
  'mesh/dispatch/incident',
  'mesh/publish/signal',
  'runtime/execute/command',
  'runtime/observe/telemetry',
  'orbit/route/entity',
  'orbit/dispatch/policy',
  'signal/publish/incident',
  'signal/read/trace',
  'recovery/escalate/timeline',
  'ops/rollback/resource',
  'ops/execute/payload',
  'audit/route/command',
  'ledger/update/snapshot',
  'telemetry/publish/stream',
  'telemetry/scan/trace',
  'policy/create/rule',
] as const;

type TemplateManifest = {
  [K in string]: {
    readonly id: K;
    readonly severity: SegmentActionMap;
    readonly policy: { readonly severity: SegmentActionMap; readonly policy: ChainPolicy<RouteTuple>; readonly requiresRollback: boolean };
  };
};

export type RouteCatalogManifest = RemappedRouteMap<{
  runtime: {
    core: 1;
    telemetry: 2;
    audit: 3;
  };
  orchestration: {
    route: 'a';
    signal: 'b';
  };
  recovery: {
    policy: 'critical';
    plan: 'stable';
  };
}>;

export const routeManifest: TemplateManifest = orbitalTemplateCatalog.reduce((acc, route) => {
  const entry = routeSeverity(route);
  acc[route] = {
    id: route,
    severity: entry,
    policy: {
      severity: entry,
      policy: chainPolicy(route),
      requiresRollback: entry === 'critical',
    },
  };
  return acc;
}, {} as TemplateManifest);

export const routeLookup = Object.fromEntries(orbitalTemplateCatalog.map((route) => [route, route])) as Record<
  RouteTuple,
  RouteTuple
>;

export const routeSeverity = (route: RouteTuple): RouteSeverity<RouteTuple> => {
  const tokens = splitRoute(route);
  if (!tokens) {
    return 'low';
  }
  const { domain, verb, entity } = tokens;
  if (domain === 'runtime' && (verb === 'execute' || verb === 'hydrate' || verb === 'dehydrate')) {
    return 'critical';
  }
  if (domain === 'fleet' && verb === 'execute' && (entity === 'command' || entity === 'incident')) {
    return 'high';
  }
  if (domain === 'mesh' && (verb === 'dispatch' || verb === 'publish')) {
    return 'high';
  }
  if (domain === 'recovery' && (verb === 'rollback' || verb === 'escalate')) {
    return 'critical';
  }
  if (entity === 'trace' || entity === 'telemetry') {
    return 'low';
  }
  return 'medium';
};

export const chainPolicy = (route: RouteTuple): ChainPolicy<RouteTuple> => {
  const parts = splitRoute(route);
  if (!parts) {
    return 'general';
  }
  const { domain, verb } = parts;
  if (domain === 'fleet' && (verb === 'route' || verb === 'dispatch')) {
    return 'control-plane';
  }
  if (domain === 'mesh' && (verb === 'bind' || verb === 'release')) {
    return 'fabric';
  }
  if (domain === 'runtime' && (verb === 'observe' || verb === 'scan')) {
    return 'introspection';
  }
  if (domain === 'orbit') {
    return 'coordination';
  }
  return 'general';
};

export const splitRoute = <T extends RouteTuple>(value: T): RouteSegmentTuple<T> | undefined => {
  const parts = value.split('/');
  const [domain, verb, entity] = parts;
  if (!domain || !verb || !entity) {
    return undefined;
  }
  if (!(routeDomains as readonly string[]).includes(domain) || !(routeVerbs as readonly string[]).includes(verb) || !(routeEntities as readonly string[]).includes(entity)) {
    return undefined;
  }
  return {
    domain: domain as RouteDomain,
    verb: verb as RouteVerb,
    entity: entity as RouteEntity,
  } as RouteSegmentTuple<T>;
};

export const makeRouteEnvelope = <T extends RouteTuple, TPayload extends Record<string, unknown>>(
  route: T,
  payload: TPayload,
): RouteEnvelope<T, TPayload> => {
  const parts = splitRoute(route);
  if (!parts) {
    throw new Error(`invalid route tuple: ${route}`);
  }
  return {
    route,
    routeParts: parts,
    policy: {
      severity: routeSeverity(route),
      policy: chainPolicy(route),
      requiresRollback: routeSeverity(route) === 'critical',
    },
    payload: {
      schema: `v-${route.length}`,
      data: payload,
      issuedAt: new Date(),
    },
  } as RouteEnvelope<T, TPayload>;
};

export type RouteEnvelopeProjection = {
  readonly route: RouteTuple;
  readonly policy: RoutePolicy<RouteTuple>;
  readonly metadata: {
    readonly catalog: RouteTuple;
    readonly severity: RouteSeverity<RouteTuple>;
  };
};

export const stressConditionalConvergenceCatalog = orbitalTemplateCatalog.map((route) => makeRouteEnvelope(route, { route }));
