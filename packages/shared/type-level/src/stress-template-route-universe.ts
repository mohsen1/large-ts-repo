export type RouteDomain =
  | 'identity'
  | 'incident'
  | 'playbook'
  | 'mesh'
  | 'signal'
  | 'forecast'
  | 'policy'
  | 'timeline';

export type RouteEntity =
  | 'node'
  | 'command'
  | 'workflow'
  | 'policy'
  | 'snapshot'
  | 'artifact';

export type RouteAction =
  | 'create'
  | 'update'
  | 'resolve'
  | 'dispatch'
  | 'observe'
  | 'simulate';

export type RouteVerb = 'get' | 'post' | 'put' | 'patch' | 'delete';

export type RoutePathPattern = `/${RouteDomain}/${RouteEntity}/${RouteAction}/${string}`;

export interface RouteEnvelope {
  readonly domain: RouteDomain;
  readonly entity: RouteEntity;
  readonly action: RouteAction;
  readonly verb: RouteVerb;
  readonly payload: string;
}

export type EventRouteSignature<T extends string> = `payload:${T}/v${number}`;

export type ParsedTemplateRoute<T extends RoutePathPattern> =
  T extends `/${infer D}/${infer E}/${infer A}/${infer I}`
    ? D extends RouteDomain
      ? E extends RouteEntity
        ? A extends RouteAction
          ? ({
              readonly domain: D;
              readonly entity: E;
              readonly action: A;
              readonly id: I;
            } & RouteEnvelope)
          : never
        : never
      : never
    : never;

export type RouteCatalogRow<T extends RoutePathPattern> = {
  readonly route: T;
  readonly signature: EventRouteSignature<T>;
  readonly parsed: ParsedTemplateRoute<T>;
};

export type RouteProjection<T extends readonly RoutePathPattern[]> = {
  readonly values: { [K in keyof T]: RouteCatalogRow<T[K]> };
};

export interface RouteCarrier<Name extends string, TKind extends string> {
  readonly name: Name;
  readonly kind: TKind;
  readonly enabled: boolean;
}

export interface RouteCarrierAudit<TKind extends string> extends RouteCarrier<'audit', TKind> {
  readonly audit: true;
}

export interface RouteCarrierPolicy<TKind extends string> extends RouteCarrier<'policy', TKind> {
  readonly policy: readonly string[];
}

export interface RouteCarrierSignal<TKind extends string> extends RouteCarrier<'signal', TKind> {
  readonly signal: 'on' | 'off';
}

export type RouteCarrierUnion = RouteCarrierAudit<string> | RouteCarrierPolicy<string> | RouteCarrierSignal<string>;

export type RouteCarrierDispatch<T extends RouteCarrierUnion> =
  T extends RouteCarrierAudit<infer K>
    ? { readonly category: 'audit'; readonly verb: K; readonly route: RoutePathPattern }
    : T extends RouteCarrierPolicy<infer K>
      ? { readonly category: 'policy'; readonly verb: K; readonly route: RoutePathPattern }
      : T extends RouteCarrierSignal<infer K>
        ? { readonly category: 'signal'; readonly verb: K; readonly route: RoutePathPattern }
        : never;

export type RouteCarrierLattice = RouteCarrierDispatch<RouteCarrierUnion>;

export type RouteKindCatalog<T extends readonly RoutePathPattern[]> = {
  readonly routeCount: T['length'];
  readonly routeMap: { [K in keyof T]: RouteCatalogRow<T[K]> };
  readonly canonical: RouteProjection<T>;
};

export const routeSamples = [
  '/identity/node/create/root-101',
  '/incident/workflow/resolve/plan-22',
  '/playbook/policy/update/route-17',
  '/mesh/signal/dispatch/bridge-91',
  '/signal/metric/observe/item-77',
] as const as readonly RoutePathPattern[];

export type RouteUniverseCatalog = RouteKindCatalog<typeof routeSamples>;

export const routeUniverseCatalog: RouteUniverseCatalog = {
  routeCount: routeSamples.length,
  routeMap: routeSamples.map((entry) => ({
    route: entry,
    signature: `payload:${entry}/v1`,
    parsed: {
      domain: routeSamples[0].split('/')[1] as RouteDomain,
      entity: routeSamples[0].split('/')[2] as RouteEntity,
      action: routeSamples[0].split('/')[3]?.split('-')[0] as RouteAction,
      id: routeSamples[0].split('/')[4] as string,
      verb: 'get',
      payload: 'seed',
    },
  })) as RouteUniverseCatalog['routeMap'],
  canonical: { values: routeSamples as unknown as RouteUniverseCatalog['canonical']['values'] },
};

export type RouteCarrierMatrix = {
  mesh: {
    dispatch: RouteCarrierSignal<'mesh'>;
    policy: RouteCarrierPolicy<'mesh'>;
  };
  signal: {
    dispatch: RouteCarrierSignal<'signal'>;
    audit: RouteCarrierAudit<'signal'>;
  };
  policy: {
    policy: RouteCarrierPolicy<'policy'>;
    audit: RouteCarrierAudit<'policy'>;
  };
};

export const routeCarrierMatrix = {
  mesh: {
    dispatch: { name: 'signal', kind: 'mesh', enabled: true, signal: 'on' },
    policy: { name: 'policy', kind: 'mesh', enabled: true, policy: ['canary'] },
  },
  signal: {
    dispatch: { name: 'signal', kind: 'signal', enabled: true, signal: 'off' },
    audit: { name: 'audit', kind: 'signal', enabled: true, audit: true },
  },
  policy: {
    policy: { name: 'policy', kind: 'policy', enabled: false, policy: ['standard'] },
    audit: { name: 'audit', kind: 'policy', enabled: false, audit: true },
  },
} satisfies RouteCarrierMatrix;
