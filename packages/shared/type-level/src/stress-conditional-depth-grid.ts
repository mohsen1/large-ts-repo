export type DomainAtom =
  | 'auth'
  | 'network'
  | 'storage'
  | 'compute'
  | 'runtime'
  | 'telemetry'
  | 'policy'
  | 'security'
  | 'billing'
  | 'synthesis'
  | 'drift'
  | 'sensitivity'
  | 'incident'
  | 'orchestrate'
  | 'continuity'
  | 'resilience'
  | 'fleet'
  | 'timeline'
  | 'audit';

export type VerbAtom =
  | 'discover'
  | 'assess'
  | 'notify'
  | 'triage'
  | 'isolate'
  | 'restore'
  | 'verify'
  | 'archive'
  | 'simulate'
  | 'audit'
  | 'drain'
  | 'compact'
  | 'rotate'
  | 'snapshot'
  | 'rebalance';

export type SeverityAtom = 'low' | 'medium' | 'high' | 'critical' | 'emergency';

export type DomainRoute = `/${DomainAtom}/${VerbAtom}/${SeverityAtom}/${string}`;

export type DecimalDepth =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20
  | 21
  | 22
  | 23
  | 24
  | 25
  | 26
  | 27
  | 28
  | 29
  | 30;

export type DecIndex = {
  [N in DecimalDepth]: N extends 0
    ? 0
    : N extends 1
    ? 0
    : N extends 2
      ? 1
      : N extends 3
        ? 2
        : N extends 4
          ? 3
          : N extends 5
            ? 4
            : N extends 6
              ? 5
              : N extends 7
                ? 6
                : N extends 8
                  ? 7
                  : N extends 9
                    ? 8
                    : N extends 10
                      ? 9
                      : N extends 11
                        ? 10
                        : N extends 12
                          ? 11
                          : N extends 13
                            ? 12
                            : N extends 14
                              ? 13
                              : N extends 15
                                ? 14
                                : N extends 16
                                  ? 15
                                  : N extends 17
                                    ? 16
                                    : N extends 18
                                      ? 17
                                      : N extends 19
                                        ? 18
                                        : N extends 20
                                          ? 19
                                          : N extends 21
                                            ? 20
                                            : N extends 22
                                              ? 21
                                              : N extends 23
                                                ? 22
                                                : N extends 24
                                                  ? 23
                                                  : N extends 25
                                                    ? 24
                                                    : N extends 26
                                                      ? 25
                                                      : N extends 27
                                                        ? 26
                                                        : N extends 28
                                                          ? 27
                                                          : N extends 29
                                                            ? 28
                                                            : N extends 30
                                                              ? 29
                                                              : 0;
};

type ResolveAtomValue<T extends string, Universe extends string> = T extends Universe ? T : never;

type EntityParse<T extends string> = T extends `${infer Left}-${infer Right}`
  ? { readonly left: Left; readonly right: Right; readonly normalized: `${Left}.${Right}` }
  : { readonly left: T; readonly right: 'unknown'; readonly normalized: `${T}-unknown` };

export type DiscriminantRoute<T extends string> = T extends `/${infer Domain}/${infer Verb}/${infer Severity}/${infer Entity}`
  ? ResolveAtomValue<Domain, DomainAtom> extends never
    ? {
        readonly kind: 'invalid-domain';
        readonly raw: T;
        readonly parts: readonly [string, string, string, string];
      }
    : ResolveAtomValue<Verb, VerbAtom> extends never
      ? {
          readonly kind: 'invalid-verb';
          readonly raw: T;
          readonly domain: ResolveAtomValue<Domain, DomainAtom>;
          readonly parts: readonly [string, string, string, string];
        }
      : ResolveAtomValue<Severity, SeverityAtom> extends never
        ? {
            readonly kind: 'invalid-severity';
            readonly raw: T;
            readonly domain: ResolveAtomValue<Domain, DomainAtom>;
            readonly verb: ResolveAtomValue<Verb, VerbAtom>;
            readonly parts: readonly [string, string, string, string];
          }
        : {
            readonly kind: 'routed';
            readonly raw: T;
            readonly domain: ResolveAtomValue<Domain, DomainAtom>;
            readonly verb: ResolveAtomValue<Verb, VerbAtom>;
            readonly severity: ResolveAtomValue<Severity, SeverityAtom>;
            readonly entity: EntityParse<Entity>;
            readonly parts: readonly [DomainAtom, VerbAtom, SeverityAtom, Entity];
          }
  : {
      readonly kind: 'not-route';
      readonly raw: T;
      readonly parts: readonly [];
    };

export type RouteUnionResolve<T extends string> = T extends string ? DiscriminantRoute<T> : never;

export type RouteFingerprint<T extends { readonly kind: string; readonly raw: string }> = T extends {
  readonly kind: 'routed';
  readonly domain: infer D;
  readonly verb: infer V;
  readonly severity: infer S;
}
  ? `route:${string & D}/${string & V}/${string & S}`
  : `fallback:${string & T['kind']}:${string & T['raw']}`;

export type RouteRewrite<T extends string> = RouteFingerprint<DiscriminantRoute<T>>;

export type RouteRewriteTuple<T extends string> = [DiscriminantRoute<T>, RouteRewrite<T>];

export type RouteCascade<
  T extends string,
  Depth extends DecimalDepth,
  Acc extends readonly string[] = [],
> = Depth extends 0 ? Acc : RouteCascade<RouteRewrite<T>, DecIndex[Depth], readonly [...Acc, RouteRewrite<T>]>;

export type RoutePipeline<T extends string, N extends DecimalDepth, TAcc extends readonly string[] = []> =
  N extends 0 ? TAcc : RoutePipeline<RouteRewrite<T>, DecIndex[N], readonly [...TAcc, T]>;

export type RouteUnionResolveWithDistribution<T extends string> = T extends DomainRoute ? RouteUnionResolve<T> : never;

export type RouteDistribute<T extends string> =
  T extends `${string}/${string}/${string}/${infer Id}`
    ? Id extends `${infer _Left}-${infer _Right}`
      ? T
      : T
    : T;

export type RouteArrayResolve<T extends readonly string[]> = {
  [K in keyof T]: RouteUnionResolveWithDistribution<T[K] & string>;
};

export const buildRoutePipeline = <T extends string, N extends DecimalDepth>(source: T, depth: N): RoutePipeline<T, N> => {
  const out: string[] = [];
  let current = source as string;
  for (let index = 0; index <= depth; index += 1) {
    out.push(current);
    current = `${current}::${String(index)}`;
  }
  return out.slice(0, depth + 1) as RoutePipeline<T, N>;
};

export type RouteRecord<T extends DomainRoute = DomainRoute> = {
  readonly id: string;
  readonly source: T;
  readonly pipeline: RoutePipeline<T, 12>;
  readonly payload: RouteUnionResolve<T>;
  readonly index: number;
  readonly trace: readonly string[];
};

export const stressRouteSamples = [
  '/auth/discover/high/tenant-7f1',
  '/network/assess/critical/node-2a',
  '/storage/restore/medium/cluster-11',
  '/compute/snapshot/emergency/service-4a',
  '/runtime/verify/high/service-77',
  '/telemetry/notify/low/node-2b',
  '/policy/triage/medium/tenant-2',
  '/security/isolate/critical/node-99',
  '/billing/restore/low/tenant-001',
  '/synthesis/simulate/high/cluster-88',
  '/drift/audit/emergency/service-13',
  '/sensitivity/rotate/medium/tenant-51',
  '/incident/drain/high/node-10',
  '/orchestrate/compact/low/node-3f',
  '/continuity/archive/critical/tenant-77',
  '/resilience/rebalance/medium/service-19',
  '/fleet/discover/high/tenant-21',
  '/timeline/notify/low/cluster-7',
  '/runtime/audit/high/node-01',
  '/network/compact/medium/tenant-2',
  '/network/compact/medium/tenant-3',
  '/network/compact/medium/tenant-4',
  '/network/compact/medium/tenant-5',
  '/network/compact/medium/tenant-6',
  '/network/compact/medium/tenant-7',
  '/network/compact/medium/tenant-8',
  '/network/compact/medium/tenant-9',
  '/network/compact/medium/tenant-a',
  '/network/compact/medium/tenant-b',
  '/network/compact/medium/tenant-c',
  '/network/compact/medium/tenant-d',
] as const satisfies readonly DomainRoute[];

export const routeKinds = new Map<string, string>([
  ['auth', 'identity'],
  ['network', 'fabric'],
  ['storage', 'persistence'],
  ['compute', 'execution'],
  ['runtime', 'scheduler'],
  ['telemetry', 'observability'],
  ['policy', 'guardrail'],
  ['security', 'threat'],
  ['billing', 'ledger'],
  ['timeline', 'chronology'],
]);

export const routeKindEntries = [...routeKinds.entries()] as const;

export type DomainRouteTuple = typeof stressRouteSamples;

const parseRouteParts = (raw: string) => {
  const [empty, domain = 'auth', verb = 'discover', severity = 'low', entity = 'tenant-0'] = raw.split('/');
  return {
    namespace: domain || 'unknown',
    route: `${empty}${domain}/${verb}/${severity}/${entity}`.slice(1),
    category: (entity.includes('-') ? entity.split('-')[0] : 'tenant') as 'tenant' | 'cluster' | 'service' | 'node',
    entity,
    verb,
    severity,
    raw,
    parts: [domain, verb, severity, entity] as const,
  };
};

export type RouteCatalogEntry<T extends string = string> = {
  readonly namespace: string;
  readonly route: T;
  readonly fingerprint: string;
  readonly category: 'tenant' | 'cluster' | 'service' | 'node';
  readonly entity: string;
  readonly parts?: readonly [string, string, string, string];
  readonly raw?: T;
};

export const parseRoute = (route: string): RouteCatalogEntry<string> => {
  const parsed = parseRouteParts(route);
  return {
    namespace: parsed.namespace,
    category: parsed.category,
    route: parsed.route,
    fingerprint: `/${parsed.parts.join('/')}` as string,
    entity: parsed.entity,
  };
};

const toRoutedRecord = (route: DomainRoute): RouteUnionResolve<DomainRoute> => {
  const parts = parseRouteParts(route);
  return {
    kind: 'routed',
    raw: route,
    domain: parts.namespace as DomainAtom,
    verb: parts.verb as VerbAtom,
    severity: parts.severity as SeverityAtom,
    entity: {
      left: parts.entity.split('-')[0] ?? 'tenant',
      right: parts.entity.split('-')[1] ?? 'unknown',
      normalized: `${parts.entity.split('-')[0] ?? 'tenant'}.${parts.entity.split('-')[1] ?? '0'}`,
    },
    parts: parts.parts as unknown as readonly [DomainAtom, VerbAtom, SeverityAtom, string],
  } as unknown as RouteUnionResolve<DomainRoute>;
};

export const routeCatalog = new Map<string, RouteRecord<DomainRoute>>(
  stressRouteSamples.map((sample) => {
    const payload = toRoutedRecord(sample);
    const entry: RouteRecord<DomainRoute> = {
      id: `route:${sample}`,
      source: sample,
      pipeline: buildRoutePipeline(sample, 12),
      payload,
      index: sample.length,
      trace: [sample, payload.kind as string, (payload as { readonly raw: string }).raw] as const,
    };
    return [sample, entry] as const;
  }),
);

export const routeInputCatalog = Object.fromEntries(
  stressRouteSamples.map((route) => {
    const parsed = parseRoute(route);
    return [
      route,
      {
        namespace: parsed.namespace,
        route,
        category: parsed.category,
        entity: parsed.entity,
        fingerprint: `/route/${route}`,
      },
    ];
  }),
) as Record<DomainRoute, RouteCatalogEntry<DomainRoute>>;

export type RoutePipelinePreview = {
  readonly route: DomainRoute;
  readonly parsed: RouteUnionResolve<DomainRoute>;
  readonly fingerprint: RouteRewrite<DomainRoute>;
};

export const routePreviews: readonly RoutePipelinePreview[] = stressRouteSamples.map((route) => {
  const parsed = toRoutedRecord(route as DomainRoute);
  return {
    route,
    parsed,
    fingerprint: parsed.kind === 'routed'
      ? (`route:${parsed.domain}/${parsed.verb}/${parsed.severity}` as RouteRewrite<DomainRoute>)
      : (`fallback:${parsed.raw}` as RouteRewrite<DomainRoute>),
  };
});

export type RouteDecision<T extends string> = {
  readonly decision: 'accept' | 'reject';
  readonly source: T;
  readonly path: string;
  readonly depth: number;
  readonly reason?: string;
  readonly entity: string;
};

export const routeDecisions = routePreviews.reduce((memo, preview) => {
  const parsed = preview.parsed;
  const isRouted = parsed.kind === 'routed';
  memo.set(preview.route, {
    decision: isRouted ? 'accept' : 'reject',
    source: preview.route,
    path: preview.route,
    depth: preview.route.length,
    entity: isRouted ? `${parsed.entity.left}:${parsed.entity.right}` : 'invalid',
    reason: isRouted ? undefined : parsed.kind,
  });
  return memo;
}, new Map<string, RouteDecision<DomainRoute>>());

export type RouteValidationBranch<T extends string> =
  T extends `${string}/${string}/${'low' | 'medium' | 'high' | 'critical' | 'emergency'}/${infer Entity}`
    ? Entity extends `${infer Left}-${infer Right}`
      ? { readonly branch: `/${Left}/${Right}`; readonly normalized: `${Left}.${Right}` }
      : { readonly branch: 'unknown'; readonly normalized: 'unknown' }
    : { readonly branch: 'invalid'; readonly normalized: 'invalid' };

export type RouteBranchCatalog<T extends readonly DomainRoute[]> = {
  [K in keyof T]: RouteValidationBranch<T[K]>;
};

export const routeBranchCatalog = stressRouteSamples.map((route) => {
  const [, , , entity = 'unknown-0'] = route.split('/');
  const parts = entity.split('-');
  return {
    branch: `/${parts[0] ?? 'tenant'}/${parts[1] ?? '0'}` as const,
    normalized: `${parts[0] ?? 'tenant'}.${parts[1] ?? '0'}`,
  } as unknown as RouteValidationBranch<DomainRoute>;
}) as unknown as RouteBranchCatalog<DomainRouteTuple>;

export type DeepRouteDecision<T extends string> =
  RouteDecision<T> & {
    readonly route: T;
    readonly fallback: RouteRewrite<T>;
    readonly branches: RouteValidationBranch<T>[];
  };

export const routeDecisionMatrix = routePreviews.map((preview) => {
  const tokens = preview.route.split('/').filter(Boolean);
  const branches = tokens
    .map((token) => ({
      branch: `/${token}/route` as const,
      normalized: token,
    }))
    .map((entry): RouteValidationBranch<DomainRoute> => ({
      branch: `/${entry.normalized}/entry` as unknown as RouteValidationBranch<DomainRoute>['branch'],
      normalized: entry.normalized as RouteValidationBranch<DomainRoute>['normalized'],
    }));

  const routed = preview.parsed;
  const entity = routed.kind === 'routed' ? routed.entity.left : 'invalid';

  return {
    route: preview.route,
    fallback: preview.fingerprint,
    branches,
    decision: routed.kind === 'routed' ? 'accept' : 'reject',
    source: preview.route,
    path: preview.route,
    depth: preview.route.length,
    entity,
    reason: routed.kind === 'routed' ? undefined : routed.kind,
  } as unknown as DeepRouteDecision<DomainRoute>;
}) as ReadonlyArray<DeepRouteDecision<DomainRoute>>;

export const routeDepthSignatures = stressRouteSamples.map((route) => {
  const cascade = new Array(25).fill(route) as unknown as RouteCascade<typeof route, 24>;
  return {
    route,
    cascadeLength: cascade.length,
    final: cascade[cascade.length - 1],
  };
});

const routeArrayResolve = <T extends readonly string[]>(values: T): RouteArrayResolve<T> => {
  return values.map((value) => toRoutedRecord(value as DomainRoute)) as unknown as RouteArrayResolve<T>;
};

export const routeUnionCatalog = routeArrayResolve(stressRouteSamples as DomainRouteTuple);
 

export const routeRewriteTable = stressRouteSamples.map((route) => [route, toRoutedRecord(route)] as const);

export { compileTemplateCatalog } from './stress-mapped-template-recursion';
