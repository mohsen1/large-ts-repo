export type VerbToken =
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
  | 'recover'
  | 'observe'
  | 'drill'
  | 'audit'
  | 'telemetry'
  | 'dispatch'
  | 'stabilize'
  | 'govern'
  | 'safeguard'
  | 'elevate'
  | 'quarantine';

export type EntityToken =
  | 'agent'
  | 'artifact'
  | 'auth'
  | 'autoscaler'
  | 'build'
  | 'cache'
  | 'cdn'
  | 'cluster'
  | 'config'
  | 'connector'
  | 'container'
  | 'dashboard'
  | 'datastore'
  | 'device'
  | 'edge'
  | 'execution'
  | 'gateway'
  | 'identity'
  | 'incident'
  | 'integration'
  | 'k8s'
  | 'lifecycle'
  | 'load'
  | 'mesh'
  | 'node'
  | 'network'
  | 'nodepool'
  | 'observer'
  | 'orchestrator'
  | 'playbook'
  | 'policy'
  | 'pipeline'
  | 'planner'
  | 'queue'
  | 'recovery'
  | 'registry'
  | 'scheduler'
  | 'signal'
  | 'store'
  | 'telemetry'
  | 'workload';

export type SeverityToken = 'low' | 'medium' | 'high' | 'critical' | 'emergency' | 'info';

export type RouteToken<
  TVerb extends VerbToken,
  TEntity extends EntityToken,
  TSeverity extends SeverityToken,
  TId extends string = string,
> = `${TVerb}:${TEntity}:${TSeverity}:${TId}`;

export interface RouteSpec {
  readonly verb: VerbToken;
  readonly entity: EntityToken;
  readonly severity: SeverityToken;
  readonly routeId: string;
  readonly source: 'fabric';
}

export type DispatchableRoute =
  | {
      readonly transport: 'http';
      readonly zone: 'edge';
      readonly priority: 'normal';
    }
  | {
      readonly transport: 'http';
      readonly zone: 'core';
      readonly priority: 'critical';
    }
  | {
      readonly transport: 'ws';
      readonly zone: 'control';
      readonly priority: 'burst';
    };

export type RouteTemplate<T extends string> = T extends `/${infer Surface}/${infer Entity}/${infer Id}/${infer Verb}`
  ? {
      readonly surface: `/${Surface}`;
      readonly entity: Entity;
      readonly id: Id;
      readonly verb: Verb;
    }
  : never;

export type ParseCatalogRoute<R extends string> =
  R extends `/${infer Surface}/${infer Entity}/${infer Id}/${infer Verb}`
    ? Surface extends 'recovery'
      ? {
          readonly layer: 'ops';
          readonly entity: Entity;
          readonly id: Id;
          readonly verb: Verb;
        }
      : Surface extends 'telemetry'
        ? {
            readonly layer: 'obs';
            readonly entity: Entity;
            readonly id: Id;
            readonly verb: Verb;
          }
        : {
            readonly layer: 'misc';
            readonly entity: Entity;
            readonly id: Id;
            readonly verb: Verb;
          }
    : never;

export type ResolveVerb<T extends VerbToken> =
  T extends 'discover'
    ? { readonly kind: 'discover'; readonly phase: 'probe'; readonly timeoutMs: 5000 }
    : T extends 'ingest'
      ? { readonly kind: 'ingest'; readonly phase: 'stream'; readonly timeoutMs: 10000 }
      : T extends 'materialize'
        ? { readonly kind: 'materialize'; readonly phase: 'construct'; readonly timeoutMs: 12000 }
        : T extends 'validate'
          ? { readonly kind: 'validate'; readonly phase: 'check'; readonly timeoutMs: 8000 }
          : T extends 'reconcile'
            ? { readonly kind: 'reconcile'; readonly phase: 'merge'; readonly timeoutMs: 9000 }
            : T extends 'synthesize'
              ? { readonly kind: 'synthesize'; readonly phase: 'compose'; readonly timeoutMs: 15000 }
              : T extends 'snapshot'
                ? { readonly kind: 'snapshot'; readonly phase: 'capture'; readonly timeoutMs: 7000 }
                : T extends 'restore'
                  ? { readonly kind: 'restore'; readonly phase: 'rewind'; readonly timeoutMs: 22000 }
                  : T extends 'simulate'
                    ? { readonly kind: 'simulate'; readonly phase: 'dry-run'; readonly timeoutMs: 6000 }
                    : T extends 'inject'
                      ? { readonly kind: 'inject'; readonly phase: 'fault'; readonly timeoutMs: 4000 }
                      : T extends 'amplify'
                        ? { readonly kind: 'amplify'; readonly phase: 'load'; readonly timeoutMs: 12000 }
                        : T extends 'throttle'
                          ? { readonly kind: 'throttle'; readonly phase: 'shed'; readonly timeoutMs: 3000 }
                          : T extends 'rebalance'
                            ? { readonly kind: 'rebalance'; readonly phase: 'shift'; readonly timeoutMs: 9000 }
                            : T extends 'reroute'
                              ? { readonly kind: 'reroute'; readonly phase: 'redirect'; readonly timeoutMs: 5000 }
                              : T extends 'contain'
                                ? { readonly kind: 'contain'; readonly phase: 'isolate'; readonly timeoutMs: 8000 }
                                : T extends 'recover'
                                  ? { readonly kind: 'recover'; readonly phase: 'repair'; readonly timeoutMs: 14000 }
                                  : T extends 'observe'
                                    ? { readonly kind: 'observe'; readonly phase: 'watch'; readonly timeoutMs: 3000 }
                                    : T extends 'drill'
                                      ? { readonly kind: 'drill'; readonly phase: 'exercise'; readonly timeoutMs: 10000 }
                                      : T extends 'audit'
                                        ? { readonly kind: 'audit'; readonly phase: 'assess'; readonly timeoutMs: 7000 }
                                        : T extends 'telemetry'
                                          ? { readonly kind: 'telemetry'; readonly phase: 'sample'; readonly timeoutMs: 2000 }
                                          : T extends 'dispatch'
                                            ? { readonly kind: 'dispatch'; readonly phase: 'route'; readonly timeoutMs: 5500 }
                                            : T extends 'stabilize'
                                              ? { readonly kind: 'stabilize'; readonly phase: 'calm'; readonly timeoutMs: 12000 }
                                              : T extends 'govern'
                                                ? { readonly kind: 'govern'; readonly phase: 'policy'; readonly timeoutMs: 5000 }
                                                : T extends 'safeguard'
                                                  ? { readonly kind: 'safeguard'; readonly phase: 'guard'; readonly timeoutMs: 7000 }
                                                  : T extends 'elevate'
                                                    ? { readonly kind: 'elevate'; readonly phase: 'elevate'; readonly timeoutMs: 11000 }
                                                    : T extends 'quarantine'
                                                      ? { readonly kind: 'quarantine'; readonly phase: 'contain'; readonly timeoutMs: 16000 }
                                                      : never;

export type RoutedPayload<T extends RouteSpec> =
  T extends {
    readonly verb: infer TVerb;
    readonly entity: infer TEntity;
    readonly severity: infer TSeverity;
    readonly routeId: infer TRawId;
    readonly source: 'fabric';
  }
    ? TVerb extends VerbToken
      ? TEntity extends EntityToken
        ? TSeverity extends SeverityToken
          ? TRawId extends string
            ? ResolveVerb<TVerb> & {
                readonly spec: `${TVerb & string}:${TEntity & string}:${TSeverity & string}:${TRawId}`;
                readonly domain: TEntity;
                readonly verbToken: TVerb & VerbToken;
                readonly severityToken: TSeverity & SeverityToken;
                readonly routeId: TRawId;
                readonly profile: ParseCatalogRoute<`/recovery/${TEntity & string}/${TRawId}/${TVerb & string}`>;
              }
            : never
          : never
        : never
      : never
    : never;

export type RouteEnvelope<T extends readonly RouteSpec[]> = {
  [Index in keyof T as T[Index] extends RouteSpec ? `${T[Index]['entity']}-route-${Index & string}` : never]: T[Index] extends RouteSpec
    ? RoutedPayload<T[Index]>
    : never;
};

export type RouteCatalogMap<TCatalog extends readonly RouteSpec[]> = {
  [Index in keyof TCatalog as TCatalog[Index] extends RouteSpec
    ? `${TCatalog[Index]['entity']}-route-${Index & string}`
    : never]: TCatalog[Index] extends RouteSpec ? RoutedPayload<TCatalog[Index]> : never;
};

export type RouteCatalogPair<T extends string> =
  T extends `${infer Verb}:${infer Entity}:${infer Severity}:${infer Id}`
    ? {
        readonly token: RouteToken<Verb & VerbToken, Entity & EntityToken, Severity & SeverityToken, Id>;
        readonly verb: Verb & VerbToken;
        readonly entity: Entity & EntityToken;
        readonly severity: Severity & SeverityToken;
        readonly id: Id;
      }
    : never;

export type RouteLookupByVerb<T extends readonly RouteSpec[], TVerb extends VerbToken> = {
  [K in keyof T as T[K] extends { verb: TVerb; routeId: infer RouteId }
    ? RouteId extends string
      ? RouteId
      : never
    : never]: T[K] extends RouteSpec ? RoutedPayload<T[K]> : never;
};

const routeDomainSeeds = [
  'agent',
  'artifact',
  'auth',
  'autoscaler',
  'build',
  'cache',
  'cdn',
  'cluster',
  'config',
  'connector',
  'container',
  'dashboard',
  'datastore',
  'device',
  'edge',
  'execution',
  'gateway',
  'identity',
  'incident',
  'integration',
  'k8s',
  'lifecycle',
  'load',
  'mesh',
  'node',
  'network',
  'nodepool',
  'observer',
  'orchestrator',
  'playbook',
  'policy',
  'pipeline',
] as const;

const verbSeeds = [
  'discover',
  'ingest',
  'materialize',
  'validate',
  'reconcile',
  'synthesize',
  'snapshot',
  'restore',
  'simulate',
  'inject',
  'amplify',
  'throttle',
  'rebalance',
  'reroute',
  'contain',
  'recover',
  'observe',
  'drill',
  'audit',
  'telemetry',
  'dispatch',
  'stabilize',
] as const;

const buildBlueprintRows = routeDomainSeeds.flatMap((entity, entityIndex) =>
  verbSeeds.map((verb, verbIndex) => {
    const key = `${verb}-${entity}`;
    const row: RouteSpec = {
      verb: verb as (typeof verbSeeds)[number],
      entity,
      severity: verbIndex % 3 === 0 ? 'critical' : verbIndex % 2 === 0 ? 'high' : 'low',
      routeId: `route-${entityIndex}-${verbIndex}`,
      source: 'fabric',
    };
    return [key, row] as const;
  }),
);

export const routeBlueprintCatalog = Object.fromEntries(buildBlueprintRows);

export const resolveRouteToken = (
  value: string,
): RouteToken<VerbToken, EntityToken, SeverityToken, string> =>
  value as RouteToken<VerbToken, EntityToken, SeverityToken, string>;

export const parseRouteToken = <T extends string>(token: T): RouteCatalogPair<T> => {
  const [verb, entity, severity, id] = token.split(':');
  return {
    token,
    verb: verb as VerbToken,
    entity: entity as EntityToken,
    severity: severity as SeverityToken,
    id,
  } as unknown as RouteCatalogPair<T>;
};

export const routeTokenCatalog = Object.values(routeBlueprintCatalog).map((item) =>
  resolveRouteToken(`${item.verb}:${item.entity}:${item.severity}:${item.routeId}`),
) as readonly RouteToken<VerbToken, EntityToken, SeverityToken, string>[];

export type RouteDispatchResult<T extends RouteSpec> = {
  readonly kind: 'dispatch';
  readonly payload: RoutedPayload<T>;
  readonly transport: DispatchableRoute['transport'];
  readonly accepted: boolean;
};

export const mapRoutePayload = <T extends readonly RouteSpec[]>(items: T): RouteLookupByVerb<T, 'recover'> => {
  const record = {} as RouteLookupByVerb<T, 'recover'>;
  for (const item of items) {
    if (item.verb === 'recover') {
      const key = item.routeId as keyof RouteLookupByVerb<T, 'recover'> & string;
      record[key] = {
        ...buildCatalogFromSpec(item),
        source: item.source,
      } as RouteLookupByVerb<T, 'recover'>[keyof RouteLookupByVerb<T, 'recover'>];
    }
  }
  return record;
};

export const routeSpecFromTemplate = <T extends string>(template: T): ParseCatalogRoute<T> => {
  return parseCatalogTemplate(template) as ParseCatalogRoute<T>;
};

const parseCatalogTemplate = (template: string) => {
  const [, surface, entity, id, verb] = template.split('/') as [string, string, string, string, string?];
  if (surface === 'recovery') {
    return {
      layer: 'ops',
      entity,
      id,
      verb,
    } as const;
  }
  if (surface === 'telemetry') {
    return {
      layer: 'obs',
      entity,
      id,
      verb,
    } as const;
  }
  return {
    layer: 'misc',
    entity,
    id,
    verb,
  } as const;
};

export const buildCatalogFromSpec = <TSpec extends RouteSpec>(spec: TSpec): RoutedPayload<TSpec> => {
  return {
    ...resolveVerb(spec.verb),
    spec: `${spec.verb}:${spec.entity}:${spec.severity}:${spec.routeId}`,
    domain: spec.entity,
    verbToken: spec.verb,
    severityToken: spec.severity,
    routeId: spec.routeId,
    profile: parseCatalogTemplate(`/recovery/${spec.entity}/${spec.routeId}/${spec.verb}`),
  } as RoutedPayload<TSpec>;
};

export const resolveVerb = <T extends VerbToken>(verb: T): ResolveVerb<T> => {
  switch (verb) {
    case 'discover':
      return { kind: 'discover', phase: 'probe', timeoutMs: 5000 } as ResolveVerb<T>;
    case 'ingest':
      return { kind: 'ingest', phase: 'stream', timeoutMs: 10000 } as ResolveVerb<T>;
    case 'materialize':
      return { kind: 'materialize', phase: 'construct', timeoutMs: 12000 } as ResolveVerb<T>;
    case 'validate':
      return { kind: 'validate', phase: 'check', timeoutMs: 8000 } as ResolveVerb<T>;
    case 'reconcile':
      return { kind: 'reconcile', phase: 'merge', timeoutMs: 9000 } as ResolveVerb<T>;
    case 'synthesize':
      return { kind: 'synthesize', phase: 'compose', timeoutMs: 15000 } as ResolveVerb<T>;
    case 'snapshot':
      return { kind: 'snapshot', phase: 'capture', timeoutMs: 7000 } as ResolveVerb<T>;
    case 'restore':
      return { kind: 'restore', phase: 'rewind', timeoutMs: 22000 } as ResolveVerb<T>;
    case 'simulate':
      return { kind: 'simulate', phase: 'dry-run', timeoutMs: 6000 } as ResolveVerb<T>;
    case 'inject':
      return { kind: 'inject', phase: 'fault', timeoutMs: 4000 } as ResolveVerb<T>;
    case 'amplify':
      return { kind: 'amplify', phase: 'load', timeoutMs: 12000 } as ResolveVerb<T>;
    case 'throttle':
      return { kind: 'throttle', phase: 'shed', timeoutMs: 3000 } as ResolveVerb<T>;
    case 'rebalance':
      return { kind: 'rebalance', phase: 'shift', timeoutMs: 9000 } as ResolveVerb<T>;
    case 'reroute':
      return { kind: 'reroute', phase: 'redirect', timeoutMs: 5000 } as ResolveVerb<T>;
    case 'contain':
      return { kind: 'contain', phase: 'isolate', timeoutMs: 8000 } as ResolveVerb<T>;
    case 'recover':
      return { kind: 'recover', phase: 'repair', timeoutMs: 14000 } as ResolveVerb<T>;
    case 'observe':
      return { kind: 'observe', phase: 'watch', timeoutMs: 3000 } as ResolveVerb<T>;
    case 'drill':
      return { kind: 'drill', phase: 'exercise', timeoutMs: 10000 } as ResolveVerb<T>;
    case 'audit':
      return { kind: 'audit', phase: 'assess', timeoutMs: 7000 } as ResolveVerb<T>;
    case 'telemetry':
      return { kind: 'telemetry', phase: 'sample', timeoutMs: 2000 } as ResolveVerb<T>;
    case 'dispatch':
      return { kind: 'dispatch', phase: 'route', timeoutMs: 5500 } as ResolveVerb<T>;
    case 'stabilize':
      return { kind: 'stabilize', phase: 'calm', timeoutMs: 12000 } as ResolveVerb<T>;
    case 'govern':
      return { kind: 'govern', phase: 'policy', timeoutMs: 5000 } as ResolveVerb<T>;
    case 'safeguard':
      return { kind: 'safeguard', phase: 'guard', timeoutMs: 7000 } as ResolveVerb<T>;
    case 'elevate':
      return { kind: 'elevate', phase: 'elevate', timeoutMs: 11000 } as ResolveVerb<T>;
    case 'quarantine':
      return { kind: 'quarantine', phase: 'contain', timeoutMs: 16000 } as ResolveVerb<T>;
    default: {
      const unreachable: never = verb as never;
      return unreachable;
    }
  }
};

export const buildRouteRecordPairs = <
  A extends readonly string[],
  B extends readonly string[],
>(
  left: A,
  right: B,
) => {
  const entries = left.map((leftItem, index) => {
    const rightItem = right[index] ?? '';
    const merged = `${leftItem}-${rightItem}/${index}`;
    const parseLeft = parseCatalogTemplate(`/${leftItem}/${index}/route/${leftItem.length}`);
    const parseRight = parseCatalogTemplate(`/${rightItem}/${index}/route/${rightItem.length}`);
    return {
      a: `${leftItem}/${leftItem.length}`,
      b: `${rightItem}/${rightItem.length}`,
      merged,
      parseLeft,
      parseRight,
    };
  });
  return entries;
};
