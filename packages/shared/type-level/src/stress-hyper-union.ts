export type RecoveryDomain =
  | 'incident'
  | 'workload'
  | 'fabric'
  | 'policy'
  | 'mesh'
  | 'timeline'
  | 'telemetry'
  | 'signal'
  | 'continuity'
  | 'compliance';

export type RecoveryVerb =
  | 'discover'
  | 'assess'
  | 'triage'
  | 'stabilize'
  | 'mitigate'
  | 'restore'
  | 'notify'
  | 'audit'
  | 'observe'
  | 'seal'
  | 'archive';

export type RecoverySeverity =
  | 'none'
  | 'low'
  | 'medium'
  | 'high'
  | 'critical'
  | 'emergency'
  | 'extreme';

export type RecoveryId =
  | 'id-a'
  | 'id-b'
  | 'id-c'
  | 'id-d'
  | 'id-e'
  | 'id-f'
  | 'id-g'
  | 'id-h'
  | 'id-i'
  | 'id-j';

export type HyperRoute = `${RecoveryDomain}:${RecoveryVerb}:${RecoverySeverity}:${RecoveryId}`;

export const hyperUnionCatalog = [
  'incident:discover:low:id-a',
  'incident:discover:medium:id-b',
  'incident:discover:high:id-c',
  'incident:discover:critical:id-d',
  'incident:discover:extreme:id-e',
  'incident:assess:low:id-b',
  'incident:assess:medium:id-c',
  'incident:assess:high:id-d',
  'incident:assess:critical:id-e',
  'incident:assess:extreme:id-f',
  'incident:triage:low:id-c',
  'incident:triage:medium:id-d',
  'incident:triage:high:id-e',
  'incident:triage:critical:id-f',
  'incident:triage:extreme:id-g',
  'incident:stabilize:low:id-d',
  'incident:stabilize:medium:id-e',
  'incident:stabilize:high:id-f',
  'incident:stabilize:critical:id-g',
  'incident:stabilize:extreme:id-h',
  'incident:mitigate:low:id-e',
  'incident:mitigate:medium:id-f',
  'incident:mitigate:high:id-g',
  'incident:mitigate:critical:id-h',
  'incident:mitigate:extreme:id-i',
  'incident:restore:low:id-f',
  'incident:restore:medium:id-g',
  'incident:restore:high:id-h',
  'incident:restore:critical:id-i',
  'incident:restore:emergency:id-j',
  'incident:notify:low:id-e',
  'incident:notify:medium:id-f',
  'incident:notify:high:id-g',
  'incident:notify:critical:id-h',
  'incident:notify:extreme:id-i',
  'incident:audit:low:id-j',
  'incident:observe:low:id-a',
  'incident:observe:medium:id-b',
  'incident:observe:high:id-c',
  'incident:observe:critical:id-d',
  'incident:observe:extreme:id-e',
  'incident:seal:low:id-f',
  'incident:seal:medium:id-g',
  'incident:seal:high:id-h',
  'incident:seal:critical:id-i',
  'incident:seal:extreme:id-j',
  'incident:archive:low:id-a',
  'incident:archive:medium:id-b',
  'incident:archive:high:id-c',
  'incident:archive:critical:id-d',
  'incident:archive:extreme:id-e',
  'workload:discover:low:id-b',
  'workload:assess:low:id-c',
  'workload:triage:medium:id-d',
  'workload:stabilize:high:id-e',
  'workload:mitigate:critical:id-f',
  'workload:restore:extreme:id-g',
  'workload:notify:critical:id-h',
  'workload:audit:low:id-i',
  'workload:observe:medium:id-j',
  'workload:seal:high:id-a',
  'workload:archive:critical:id-b',
  'fabric:discover:low:id-c',
  'fabric:assess:medium:id-d',
  'fabric:triage:high:id-e',
  'fabric:stabilize:critical:id-f',
  'fabric:mitigate:extreme:id-g',
  'fabric:restore:low:id-h',
  'fabric:notify:medium:id-i',
  'fabric:audit:high:id-j',
  'fabric:observe:critical:id-a',
  'fabric:seal:critical:id-b',
  'fabric:archive:extreme:id-c',
  'policy:discover:low:id-d',
  'policy:assess:medium:id-e',
  'policy:triage:high:id-f',
  'policy:stabilize:critical:id-g',
  'policy:mitigate:extreme:id-h',
  'policy:restore:low:id-i',
  'policy:notify:medium:id-j',
  'policy:audit:high:id-a',
  'policy:observe:critical:id-b',
  'policy:seal:critical:id-c',
  'policy:archive:extreme:id-d',
  'mesh:discover:low:id-e',
  'mesh:assess:medium:id-f',
  'mesh:triage:critical:id-g',
  'mesh:stabilize:extreme:id-h',
  'mesh:mitigate:low:id-i',
  'mesh:restore:medium:id-j',
  'mesh:notify:high:id-a',
  'mesh:audit:critical:id-b',
  'mesh:observe:critical:id-c',
  'mesh:seal:critical:id-d',
  'mesh:archive:extreme:id-e',
  'timeline:discover:low:id-f',
  'timeline:assess:medium:id-g',
  'timeline:triage:high:id-h',
  'timeline:stabilize:critical:id-i',
  'timeline:mitigate:critical:id-j',
  'timeline:restore:critical:id-a',
  'timeline:notify:critical:id-b',
  'timeline:archive:critical:id-c',
  'telemetry:discover:low:id-d',
  'telemetry:assess:medium:id-e',
  'telemetry:triage:high:id-f',
  'telemetry:stabilize:critical:id-g',
  'telemetry:notify:emergency:id-h',
  'telemetry:notify:extreme:id-h',
  'telemetry:audit:extreme:id-i',
  'telemetry:observe:medium:id-j',
  'telemetry:seal:critical:id-a',
  'telemetry:archive:extreme:id-b',
  'signal:discover:low:id-c',
  'signal:assess:medium:id-d',
  'signal:triage:critical:id-e',
  'signal:stabilize:extreme:id-f',
  'signal:mitigate:critical:id-g',
  'signal:restore:high:id-h',
  'signal:notify:critical:id-i',
  'signal:audit:low:id-j',
  'signal:observe:extreme:id-a',
  'signal:seal:critical:id-b',
  'signal:archive:extreme:id-c',
  'continuity:discover:medium:id-d',
  'continuity:assess:high:id-e',
  'continuity:triage:critical:id-f',
  'continuity:stabilize:extreme:id-g',
  'continuity:mitigate:critical:id-h',
  'continuity:restore:critical:id-i',
  'continuity:notify:emergency:id-j',
  'continuity:audit:critical:id-a',
  'continuity:observe:low:id-b',
  'continuity:seal:high:id-c',
  'continuity:archive:extreme:id-d',
  'compliance:discover:low:id-e',
  'compliance:assess:medium:id-f',
  'compliance:triage:high:id-g',
  'compliance:stabilize:critical:id-h',
  'compliance:mitigate:extreme:id-i',
  'compliance:restore:high:id-j',
  'compliance:notify:critical:id-a',
  'compliance:audit:low:id-b',
  'compliance:observe:medium:id-c',
  'compliance:seal:critical:id-d',
  'compliance:archive:extreme:id-e',
] as const satisfies readonly HyperRoute[];

export type RouteDomain<T extends string> = T extends `${infer Domain}:${string}:${string}:${string}` ? Domain : never;
export type RouteVerb<T extends string> = T extends `${string}:${infer Verb}:${string}:${string}` ? Verb : never;
export type RouteSeverity<T extends string> = T extends `${string}:${string}:${infer Severity}:${string}` ? Severity : never;
export type RouteId<T extends string> = T extends `${string}:${string}:${string}:${infer Id}` ? Id : never;

export type RouteTemplate<T extends string> = T extends `${infer Domain}:${infer Verb}:${infer Severity}:${infer Identifier}`
  ? `/${Domain}/${Verb}/${Severity}/${Identifier}`
  : never;

type RouteLabel<T extends string> = T extends `${infer Domain}:${infer Verb}:${infer Severity}:${infer Identifier}`
  ? `${Domain}-${Verb}-${Severity}-${Identifier}`
  : never;

type DomainResolve<T extends string> = T extends 'incident'
  ? 'domain:incident'
  : T extends 'workload'
    ? 'domain:workload'
    : T extends 'fabric'
      ? 'domain:fabric'
      : T extends 'policy'
        ? 'domain:policy'
        : T extends 'mesh'
          ? 'domain:mesh'
          : T extends 'timeline'
            ? 'domain:timeline'
            : T extends 'telemetry'
              ? 'domain:telemetry'
              : T extends 'signal'
                ? 'domain:signal'
                : T extends 'continuity'
                  ? 'domain:continuity'
                  : T extends 'compliance'
                    ? 'domain:compliance'
                    : 'domain:other';

type SeverityRank<T extends string> = T extends `${string}:${string}:${'critical' | 'emergency' | 'extreme'}:${string}`
  ? 3
  : 1;

export type ResolveRoute<T extends string> = T extends `${infer D}:${infer V}:${infer S}:${infer I}`
  ? {
      readonly domain: D;
      readonly verb: V;
      readonly severity: S;
      readonly identifier: I;
      readonly label: RouteLabel<T>;
      readonly routing: `${DomainResolve<D>}/${V}/${S}`;
      readonly template: RouteTemplate<T>;
    }
  : never;

export type ResolveUnion<T extends HyperRoute> = T extends HyperRoute ? ResolveRoute<T> : never;
export type RouteSet<T extends readonly HyperRoute[]> = { [K in keyof T]: T[K] extends HyperRoute ? ResolveRoute<T[K]> : never };

export type RouteCascade<T extends HyperRoute, Depth extends number = 24> = Depth extends 0
  ? {
      readonly cursor: T;
      readonly depth: 0;
      readonly next: null;
    }
  : {
      readonly cursor: T;
      readonly depth: Depth;
      readonly next: RouteCascade<T, Decrement<Depth>>;
    };

type BuildTuple<N extends number, T extends unknown[] = []> = T['length'] extends N ? T : BuildTuple<N, [...T, unknown]>;
type Decrement<N extends number> = BuildTuple<N> extends [unknown, ...infer Rest] ? Rest['length'] : 0;

type RouteNormalizer<T extends string> = T extends `${infer D}:${infer V}:${infer S}:${infer I}`
  ? `${Lowercase<D>}:${Lowercase<V>}:${Lowercase<S>}:${Lowercase<I>}`
  : T;

export type RouteEnvelope<T extends HyperRoute> = Readonly<{
  readonly original: T;
  readonly normalized: RouteNormalizer<T>;
  readonly parsed: ResolveRoute<T>;
  readonly weight: SeverityRank<T>;
}>;

export type CascadeEnvelopeMatrix<T extends readonly HyperRoute[], Depth extends number = 10> = {
  [K in keyof T]: T[K] extends HyperRoute ? RouteCascade<T[K], Depth> : never;
};

export const parseHyperRoute = <T extends HyperRoute>(route: T): RouteEnvelope<T> => {
  const [domain, verb, severity, identifier] = route.split(':') as [
    RecoveryDomain,
    RecoveryVerb,
    RecoverySeverity,
    RecoveryId,
  ];

  const normalized = `${domain.toLowerCase()}:${verb.toLowerCase()}:${severity.toLowerCase()}:${identifier.toLowerCase()}` as RouteNormalizer<T>;
  const parsed = {
    domain,
    verb,
    severity,
    identifier,
    label: `${domain}-${verb}-${severity}-${identifier}` as RouteLabel<T>,
    routing: `${domain.toLowerCase()}:${verb.toLowerCase()}:${severity.toLowerCase()}` as `domain:${string}:${string}`,
    template: `/recovery/${domain}/${verb}/${severity}/${identifier}` as RouteTemplate<T>,
  } as ResolveRoute<T>;

  return {
    original: route,
    normalized,
    parsed,
    weight: (severity === 'critical' || severity === 'emergency' || severity === 'extreme' ? 3 : 1) as SeverityRank<T>,
  };
};

const buildCascade = <T extends HyperRoute, D extends number>(route: T, depth: D): RouteCascade<T, D> => {
  const recursion = (cursor: number): RouteCascade<T, number> => {
    if (cursor <= 0) {
      return {
        cursor: route,
        depth: 0,
        next: null,
      } as unknown as RouteCascade<T, number>;
    }
    return {
      cursor: route,
      depth: cursor,
      next: recursion(cursor - 1),
    } as unknown as RouteCascade<T, number>;
  };
  return recursion(Number(depth)) as RouteCascade<T, D>;
};

export const buildRouteCascade = <T extends readonly HyperRoute[], Depth extends number>(
  routes: T,
  depth: Depth,
): CascadeEnvelopeMatrix<T, Depth> => {
  const depthValue = Number(depth);
  return routes.map((route) => buildCascade(route, depthValue) as RouteCascade<HyperRoute, Depth>) as CascadeEnvelopeMatrix<T, Depth>;
};

export const resolveRouteGrid = <T extends readonly HyperRoute[]>(routes: T): readonly RouteEnvelope<T[number]>[] => {
  return routes.map((route) => parseHyperRoute(route) as RouteEnvelope<T[number]>);
};

export type RouteUnion = ResolveUnion<HyperRoute>;

export { hyperUnionCatalog as routeCatalog };
