type KnownOrbitDomain =
  | 'atlas'
  | 'pulse'
  | 'sentry'
  | 'fabric'
  | 'drift'
  | 'vector'
  | 'signal'
  | 'policy'
  | 'workflow'
  | 'recovery'
  | 'audit'
  | 'chronicle'
  | 'timeline'
  | 'safety'
  | 'insight'
  | 'command'
  | 'telemetry'
  | 'orchestrator'
  | 'saga'
  | 'synthesis'
  | 'quantum'
  | 'continuity'
  | 'readiness'
  | 'fusion'
  | 'strategy'
  | 'stability'
  | 'cadence'
  | 'scenario'
  | 'incident'
  | 'mesh'
  | 'chronicle-ops'
  | 'intent'
  | 'control'
  | 'fabric-ops'
  | 'continuum';

type KnownOrbitAction =
  | 'bootstrap'
  | 'plan'
  | 'dispatch'
  | 'evaluate'
  | 'guard'
  | 'resolve'
  | 'adapt'
  | 'simulate'
  | 'ingest'
  | 'archive'
  | 'replay'
  | 'scale'
  | 'throttle'
  | 'saturate'
  | 'heal'
  | 'notify'
  | 'snapshot'
  | 'recover'
  | 'checkpoint'
  | 'route'
  | 'observe'
  | 'reconcile'
  | 'evict'
  | 'provision'
  | 'decommission';

type KnownOrbitScope =
  | 'global'
  | 'regional'
  | 'tenant'
  | 'workload'
  | 'cluster'
  | 'fleet'
  | 'playbook'
  | 'pipeline'
  | 'mesh'
  | 'edge'
  | 'control-plane'
  | 'data-plane'
  | 'runtime'
  | 'surface'
  | 'lab'
  | 'signal-gateway'
  | 'safety-net';

type KnownOrbitResource =
  | 'ledger'
  | 'route'
  | 'engine'
  | 'operator'
  | 'policy'
  | 'playbook'
  | 'contract'
  | 'manifest'
  | 'session'
  | 'command'
  | 'timeline'
  | 'dashboard'
  | 'catalog'
  | 'situation'
  | 'report';

type KnownRoute = `/${KnownOrbitDomain}/${KnownOrbitAction}/${KnownOrbitScope}`;
type OpenRoute = `/${string}/${string}/${string}`;

export type OrbitRoute = KnownRoute | OpenRoute;

export type RouteParts<T extends OrbitRoute> =
  T extends KnownRoute
    ? T extends `/${infer D}/${infer A}/${infer S}`
      ? D extends OrbitDomain
        ? A extends OrbitAction
          ? S extends OrbitScope
            ? {
                readonly domain: D;
                readonly action: A;
                readonly scope: S;
              }
            : never
          : never
        : never
      : never
    : T extends OpenRoute
      ? {
          readonly domain: OrbitDomain;
          readonly action: OrbitAction;
          readonly scope: OrbitScope;
        }
      : never;

export type OrbitStage =
  | 'ready'
  | 'starting'
  | 'steady'
  | 'draining'
  | 'recovering'
  | 'sealed'
  | 'deferred';

export type OrbitPriority =
  | 'critical'
  | 'high'
  | 'medium'
  | 'low'
  | 'trace'
  | 'background';

export type OrbitDomain = KnownOrbitDomain | (string & {});
export type OrbitAction = KnownOrbitAction | (string & {});
export type OrbitScope = KnownOrbitScope | (string & {});
export type OrbitResource = KnownOrbitResource | (string & {});

export type ResolveOrbitPayload<
  TDomain extends OrbitDomain,
  TAction extends OrbitAction,
  TScope extends OrbitScope,
> =
  TDomain extends 'atlas'
    ? TAction extends 'bootstrap'
      ? {
          readonly scope: TScope;
          readonly stage: 'starting';
          readonly priority: 'critical';
          readonly resource: 'session';
        }
      : TAction extends 'dispatch'
        ? {
            readonly scope: TScope;
            readonly stage: 'steady';
            readonly priority: 'high';
            readonly resource: 'route';
          }
        : TAction extends 'evaluate'
          ? {
              readonly scope: TScope;
              readonly stage: 'ready';
              readonly priority: 'medium';
              readonly resource: 'dashboard';
            }
          : TAction extends 'simulate'
            ? {
                readonly scope: TScope;
                readonly stage: 'steady';
                readonly priority: 'low';
                readonly resource: 'playbook';
              }
            : TAction extends 'notify'
              ? {
                  readonly scope: TScope;
                  readonly stage: 'starting';
                  readonly priority: 'background';
                  readonly resource: 'session';
                }
              : {
                  readonly scope: TScope;
                  readonly stage: 'deferred';
                  readonly priority: 'medium';
                  readonly resource: 'manifest';
                }
    : TDomain extends 'pulse'
      ? TAction extends 'ingest'
        ? {
            readonly scope: TScope;
            readonly stage: 'steady';
            readonly priority: 'high';
            readonly resource: 'signal';
          }
        : TAction extends 'snapshot'
          ? {
              readonly scope: TScope;
              readonly stage: 'starting';
              readonly priority: 'critical';
              readonly resource: 'timeline';
            }
          : TAction extends 'scale'
            ? {
                readonly scope: TScope;
                readonly stage: 'steady';
                readonly priority: 'medium';
                readonly resource: 'fleet';
              }
            : TAction extends 'route'
              ? {
                  readonly scope: TScope;
                  readonly stage: 'ready';
                  readonly priority: 'low';
                  readonly resource: 'route';
                }
              : {
                  readonly scope: TScope;
                  readonly stage: 'deferred';
                  readonly priority: 'background';
                  readonly resource: 'catalog';
                }
      : TDomain extends 'sentry'
        ? TAction extends 'guard'
          ? {
              readonly scope: TScope;
              readonly stage: 'steady';
              readonly priority: 'critical';
              readonly resource: 'policy';
            }
          : TAction extends 'heal'
            ? {
                readonly scope: TScope;
                readonly stage: 'recovering';
                readonly priority: 'high';
                readonly resource: 'operator';
              }
            : TAction extends 'reconcile'
              ? {
                  readonly scope: TScope;
                  readonly stage: 'ready';
                  readonly priority: 'medium';
                  readonly resource: 'ledger';
                }
              : TAction extends 'recover'
                ? {
                    readonly scope: TScope;
                    readonly stage: 'recovering';
                    readonly priority: 'critical';
                    readonly resource: 'session';
                  }
                : {
                    readonly scope: TScope;
                    readonly stage: 'deferred';
                    readonly priority: 'low';
                    readonly resource: 'contract';
                  }
        : TDomain extends 'control'
          ? TAction extends 'plan'
            ? {
                readonly scope: TScope;
                readonly stage: 'starting';
                readonly priority: 'high';
                readonly resource: 'playbook';
              }
            : TAction extends 'resolve'
              ? {
                  readonly scope: TScope;
                  readonly stage: 'steady';
                  readonly priority: 'critical';
                  readonly resource: 'command';
                }
              : TAction extends 'replay'
                ? {
                    readonly scope: TScope;
                    readonly stage: 'recovering';
                    readonly priority: 'medium';
                    readonly resource: 'timeline';
                  }
                : TAction extends 'archive'
                  ? {
                      readonly scope: TScope;
                      readonly stage: 'ready';
                      readonly priority: 'low';
                      readonly resource: 'report';
                    }
                  : {
                      readonly scope: TScope;
                      readonly stage: 'deferred';
                      readonly priority: 'trace';
                      readonly resource: 'manifest';
                    }
          : TDomain extends 'quantum'
            ? TAction extends 'simulate'
              ? {
                  readonly scope: TScope;
                  readonly stage: 'starting';
                  readonly priority: 'critical';
                  readonly resource: 'engine';
                }
              : TAction extends 'evaluate'
                ? {
                    readonly scope: TScope;
                    readonly stage: 'steady';
                    readonly priority: 'high';
                    readonly resource: 'dashboard';
                  }
                : TAction extends 'checkpoint'
                  ? {
                      readonly scope: TScope;
                      readonly stage: 'ready';
                      readonly priority: 'medium';
                      readonly resource: 'snapshot';
                    }
                  : {
                      readonly scope: TScope;
                      readonly stage: 'deferred';
                      readonly priority: 'low';
                      readonly resource: 'contract';
                    }
            : TDomain extends 'incident'
              ? TAction extends 'dispatch'
                ? {
                    readonly scope: TScope;
                    readonly stage: 'starting';
                    readonly priority: 'critical';
                    readonly resource: 'command';
                  }
                : TAction extends 'observe'
                  ? {
                      readonly scope: TScope;
                      readonly stage: 'ready';
                      readonly priority: 'medium';
                      readonly resource: 'dashboard';
                    }
                  : TAction extends 'notify'
                    ? {
                        readonly scope: TScope;
                        readonly stage: 'steady';
                        readonly priority: 'high';
                        readonly resource: 'timeline';
                      }
                    : {
                        readonly scope: TScope;
                        readonly stage: 'deferred';
                        readonly priority: 'low';
                        readonly resource: 'session';
                      }
              : {
                  readonly scope: TScope;
                  readonly stage: 'deferred';
                  readonly priority: OrbitPriority;
                  readonly resource: OrbitResource;
                };

export type ResolveOrbitRoute<T extends OrbitRoute> = T extends KnownRoute
  ? RouteParts<T> extends {
      domain: infer D;
      action: infer A;
      scope: infer S;
    }
    ? D extends OrbitDomain
      ? A extends OrbitAction
        ? S extends OrbitScope
          ? ResolveOrbitPayload<D, A, S>
          : never
        : never
      : never
    : never
  : {
      readonly scope: OrbitScope;
      readonly stage: 'deferred';
      readonly priority: OrbitPriority;
      readonly resource: OrbitResource;
    };

export type RouteEnvelope<T extends OrbitRoute> = {
  readonly path: T;
} & ResolveOrbitRoute<T>;

export type OrbitRouteMap<TDomain extends OrbitDomain> = {
  [K in OrbitRoute as K extends `/${Extract<TDomain, KnownOrbitDomain>}/${infer A}/${infer B}`
    ? A extends KnownOrbitAction
      ? B extends KnownOrbitScope
        ? `${Extract<TDomain, KnownOrbitDomain>}::${A}::${B}`
        : never
      : never
    : never]: K extends OrbitRoute ? RouteEnvelope<K> : never;
};

export type RouteByDomain = {
  [D in KnownOrbitDomain]: {
    readonly domain: D;
    readonly routes: OrbitRouteMap<D>;
  }
};

export type OrbitRouteKey<R extends OrbitRoute> =
  R extends `/${infer D}/${infer A}/${infer S}`
    ? `${D & string}=>${A & string}=>${S & string}`
    : never;

export type ResolveByDiscriminant<T> = T extends `/${infer D}/${infer A}/${infer S}`
  ? D extends KnownOrbitDomain
    ? A extends KnownOrbitAction
      ? S extends KnownOrbitScope
        ? {
            readonly domain: D;
            readonly action: A;
            readonly scope: S;
            readonly stage: ResolveOrbitPayload<D, A, S>['stage'];
          }
        : never
      : never
    : never
  : never;

export const orbitRouteSeed = [
  '/atlas/bootstrap/global',
  '/pulse/dispatch/edge',
  '/quantum/simulate/runtime',
  '/incident/dispatch/tenant',
  '/control/plan/control-plane',
  '/sentry/guard/data-plane',
  '/fabric-ops/scale/cluster',
  '/strategy/observe/surface',
] as const;

export type OrbitCatalog = typeof orbitRouteSeed[number] & OrbitRoute;

export const resolveOrbitRouteCatalog = (
  value: string,
): OrbitCatalog | null => {
  return (orbitRouteSeed as readonly string[]).includes(value) ? (value as OrbitCatalog) : null;
};

export type RouteStateTuple =
  | [OrbitDomain, OrbitAction, OrbitScope]
  | [OrbitDomain, OrbitAction, OrbitScope, OrbitResource]
  | [OrbitDomain, OrbitAction, OrbitScope, OrbitResource, OrbitPriority];

export type OrbitStateFromTuple<T extends RouteStateTuple> = T extends [
  infer D,
  infer A,
  infer S,
]
  ? D extends OrbitDomain
    ? A extends OrbitAction
      ? S extends OrbitScope
        ? RouteEnvelope<`/${D}/${A}/${S}`>
        : never
      : never
    : never
  : T extends [infer D, infer A, infer S, infer R]
    ? D extends OrbitDomain
      ? A extends OrbitAction
        ? S extends OrbitScope
          ? R extends OrbitResource
            ? RouteEnvelope<`/${D}/${A}/${S}`> & { resource: R }
            : never
          : never
        : never
      : never
    : T extends [infer D, infer A, infer S, infer R, infer P]
      ? D extends OrbitDomain
        ? A extends OrbitAction
          ? S extends OrbitScope
            ? R extends OrbitResource
              ? P extends OrbitPriority
                ? RouteEnvelope<`/${D}/${A}/${S}`> & { resource: R; priority: P }
                : never
              : never
            : never
          : never
        : never
      : never;
