export type StressRegion =
  | 'incident'
  | 'fabric'
  | 'policy'
  | 'timeline'
  | 'atlas'
  | 'workload'
  | 'signal'
  | 'mesh'
  | 'recovery'
  | 'saga'
  | 'ops';

export type StressAction =
  | 'discover'
  | 'assess'
  | 'contain'
  | 'stabilize'
  | 'restore'
  | 'notify'
  | 'audit'
  | 'simulate'
  | 'drill'
  | 'quarantine'
  | 'triage'
  | 'route'
  | 'rollback'
  | 'safeguard'
  | 'drain'
  | 'observe'
  | 'reconcile'
  | 'throttle'
  | 'evacuate'
  | 'deploy'
  | 'suppress'
  | 'resume'
  | 'finalize'
  | 'snapshot'
  | 'replay';

export type StressSeverity = 'critical' | 'high' | 'medium' | 'low' | 'warmup';
export type StressScope = 'tenant' | 'workspace' | 'session' | 'domain';

export type StressRouteToken =
  | 'incident/discover/critical/session'
  | 'incident/assess/high/tenant'
  | 'incident/contain/medium/workspace'
  | 'incident/stabilize/low/domain'
  | 'incident/restore/critical/tenant'
  | 'incident/notify/high/session'
  | 'incident/audit/medium/workspace'
  | 'incident/simulate/warmup/domain'
  | 'incident/drill/critical/session'
  | 'incident/quarantine/high/tenant'
  | 'incident/triage/medium/workspace'
  | 'incident/route/low/domain'
  | 'incident/rollback/critical/session'
  | 'incident/safeguard/high/tenant'
  | 'incident/drain/medium/workspace'
  | 'incident/observe/low/domain'
  | 'fabric/discover/medium/session'
  | 'fabric/assess/high/tenant'
  | 'fabric/contain/critical/workspace'
  | 'fabric/stabilize/low/domain'
  | 'fabric/restore/high/session'
  | 'fabric/notify/medium/tenant'
  | 'fabric/audit/low/workspace'
  | 'fabric/simulate/critical/domain'
  | 'fabric/drill/medium/session'
  | 'fabric/quarantine/high/tenant'
  | 'fabric/triage/low/workspace'
  | 'fabric/route/medium/domain'
  | 'fabric/rollback/high/session'
  | 'fabric/safeguard/critical/tenant'
  | 'fabric/drain/low/workspace'
  | 'policy/discover/low/domain'
  | 'policy/assess/high/session'
  | 'policy/contain/critical/tenant'
  | 'policy/stabilize/medium/workspace'
  | 'policy/restore/low/domain'
  | 'policy/notify/critical/session'
  | 'policy/audit/medium/tenant'
  | 'policy/simulate/high/workspace'
  | 'policy/drill/low/domain'
  | 'policy/quarantine/critical/session'
  | 'policy/finalize/medium/tenant'
  | 'policy/snapshot/low/workspace'
  | 'ops/replay/warmup/domain';

export type SeverityBand<T extends string> = T extends 'critical'
  ? 'band-0'
  : T extends 'high'
    ? 'band-1'
    : T extends 'medium'
      ? 'band-2'
      : T extends 'low'
        ? 'band-3'
        : T extends 'warmup'
          ? 'band-4'
          : 'band-unknown';

export type ScopePenalty<T extends string> =
  T extends 'tenant'
    ? 0
    : T extends 'workspace'
      ? 1
      : T extends 'session'
        ? 2
        : T extends 'domain'
          ? 3
          : 4;

export type RouteShape<T extends string> = T extends `${infer R}/${infer A}/${infer S}/${infer P}`
  ? {
      readonly region: R;
      readonly action: A;
      readonly severity: S;
      readonly scope: P;
    }
  : never;

export type SeverityClass<T extends string> = T extends `${string}/${string}/critical/${string}`
  ? { readonly level: 'immediate'; readonly escalate: true; readonly maxAttempts: 1 }
  : T extends `${string}/${string}/high/${string}`
    ? { readonly level: 'urgent'; readonly escalate: true; readonly maxAttempts: 2 }
    : T extends `${string}/${string}/medium/${string}`
      ? { readonly level: 'normal'; readonly escalate: false; readonly maxAttempts: 5 }
      : T extends `${string}/${string}/low/${string}`
        ? { readonly level: 'routine'; readonly escalate: false; readonly maxAttempts: 10 }
        : T extends `${string}/${string}/warmup/${string}`
          ? { readonly level: 'probe'; readonly escalate: false; readonly maxAttempts: 99 }
          : never;

export type ScopeClass<T extends string> = T extends `${string}/${string}/${string}/tenant`
  ? { readonly scopeClass: 'global'; readonly priority: 10 }
  : T extends `${string}/${string}/${string}/workspace`
    ? { readonly scopeClass: 'regional'; readonly priority: 20 }
    : T extends `${string}/${string}/${string}/session`
      ? { readonly scopeClass: 'ephemeral'; readonly priority: 30 }
      : T extends `${string}/${string}/${string}/domain`
        ? { readonly scopeClass: 'permanent'; readonly priority: 40 }
        : { readonly scopeClass: 'unknown'; readonly priority: 50 };

export type ActionFamily<T extends string> = T extends `${string}/discover/${string}/${string}`
  ? { readonly family: 'intake'; readonly budget: 4 }
  : T extends `${string}/assess/${string}/${string}`
    ? { readonly family: 'analysis'; readonly budget: 6 }
    : T extends `${string}/contain/${string}/${string}`
      ? { readonly family: 'containment'; readonly budget: 12 }
      : T extends `${string}/stabilize/${string}/${string}`
        ? { readonly family: 'stabilization'; readonly budget: 8 }
        : T extends `${string}/restore/${string}/${string}`
          ? { readonly family: 'recovery'; readonly budget: 16 }
          : T extends `${string}/notify/${string}/${string}`
            ? { readonly family: 'communication'; readonly budget: 40 }
            : T extends `${string}/audit/${string}/${string}`
              ? { readonly family: 'observation'; readonly budget: 99 }
              : T extends `${string}/simulate/${string}/${string}`
                ? { readonly family: 'simulation'; readonly budget: 24 }
                : T extends `${string}/drill/${string}/${string}`
                  ? { readonly family: 'exercise'; readonly budget: 20 }
                  : T extends `${string}/quarantine/${string}/${string}`
                    ? { readonly family: 'isolation'; readonly budget: 18 }
                    : T extends `${string}/triage/${string}/${string}`
                      ? { readonly family: 'analysis'; readonly budget: 9 }
                      : T extends `${string}/route/${string}/${string}`
                        ? { readonly family: 'routing'; readonly budget: 15 }
                        : T extends `${string}/rollback/${string}/${string}`
                          ? { readonly family: 'rollback'; readonly budget: 7 }
                          : T extends `${string}/safeguard/${string}/${string}`
                            ? { readonly family: 'guardrail'; readonly budget: 5 }
                            : T extends `${string}/drain/${string}/${string}`
                              ? { readonly family: 'shutdown'; readonly budget: 22 }
                              : T extends `${string}/observe/${string}/${string}`
                                ? { readonly family: 'observation'; readonly budget: 55 }
                                : T extends `${string}/reconcile/${string}/${string}`
                                  ? { readonly family: 'correction'; readonly budget: 50 }
                                  : T extends `${string}/throttle/${string}/${string}`
                                    ? { readonly family: 'load-control'; readonly budget: 11 }
                                    : T extends `${string}/evacuate/${string}/${string}`
                                      ? { readonly family: 'deescalation'; readonly budget: 13 }
                                      : T extends `${string}/deploy/${string}/${string}`
                                        ? { readonly family: 'platform'; readonly budget: 19 }
                                        : T extends `${string}/suppress/${string}/${string}`
                                          ? { readonly family: 'noise-control'; readonly budget: 27 }
                                          : T extends `${string}/resume/${string}/${string}`
                                            ? { readonly family: 'resumption'; readonly budget: 31 }
                                            : T extends `${string}/finalize/${string}/${string}`
                                              ? { readonly family: 'closure'; readonly budget: 2 }
                                              : T extends `${string}/snapshot/${string}/${string}`
                                                ? { readonly family: 'state'; readonly budget: 42 }
                                                : T extends `${string}/replay/${string}/${string}`
                                                  ? { readonly family: 'history'; readonly budget: 33 }
                                                  : { readonly family: 'misc'; readonly budget: 1 };

type RegionLoad<T extends StressRegion> =
  T extends 'incident'
    ? 11
    : T extends 'fabric'
      ? 13
      : T extends 'policy'
        ? 17
        : T extends 'timeline'
          ? 5
          : T extends 'atlas'
            ? 7
            : T extends 'workload'
              ? 9
              : T extends 'signal'
                ? 3
                : T extends 'mesh'
                  ? 19
                  : T extends 'recovery'
                    ? 29
                    : T extends 'saga'
                      ? 31
                      : 37;

export type DiscriminatedRouteResolution<T extends StressRouteToken> = RouteShape<T> extends infer Route
  ? Route extends {
      readonly region: infer Region;
      readonly severity: infer Severity;
      readonly scope: infer Scope;
      readonly action: infer Action;
    }
    ? SeverityClass<T> &
        ScopeClass<T> &
        ActionFamily<T> & {
          readonly region: Region extends StressRegion ? Region : never;
          readonly severity: Severity;
          readonly scope: Scope;
          readonly action: Action;
          readonly penalty: ScopePenalty<Extract<Scope, string>>;
          readonly band: SeverityBand<Extract<Severity, string>>;
          readonly regionLoad: RegionLoad<Extract<Region, StressRegion>>;
          readonly route: T;
        }
    : never
  : never;

export type RouteResolutionUnion<TUnion extends StressRouteToken> = TUnion extends StressRouteToken
  ? DiscriminatedRouteResolution<TUnion>
  : never;

export type RouteBudgetGate<TUnion extends StressRouteToken> = RouteResolutionUnion<TUnion> extends infer R
  ? R extends { readonly budget: infer Budget; readonly level: infer Level }
    ? Budget extends number
      ? Level extends 'immediate'
        ? Budget
        : Level extends 'urgent'
          ? Budget
          : Level extends 'normal'
            ? Budget
            : Level extends 'routine'
              ? Budget
              : Level extends 'probe'
                ? Budget
                : never
      : never
    : never
  : never;

export type ChainResolution<TUnion extends StressRouteToken, Previous extends ReadonlyArray<unknown> = []> =
  TUnion extends `${infer _Region}/${infer _Action}/${infer Severity}/${infer Scope}`
    ? [...Previous, DiscriminatedRouteResolution<TUnion>, RouteBudgetGate<TUnion>] & {
        readonly route: TUnion;
        readonly severity: Severity;
        readonly scope: Scope;
      }
    : Previous;

export const resolveRoutes = <T extends readonly StressRouteToken[]>(
  routes: T,
): { readonly [K in keyof T]: DiscriminatedRouteResolution<T[K]> } =>
  routes as { readonly [K in keyof T]: DiscriminatedRouteResolution<T[K]> };

export const routeCatalog = [
  'incident/discover/critical/session',
  'incident/assess/high/tenant',
  'fabric/contain/critical/workspace',
  'policy/restore/low/domain',
  'ops/replay/warmup/domain',
] as const satisfies Readonly<StressRouteToken[]>;

export const resolveCatalog = (routes: readonly StressRouteToken[]): readonly DiscriminatedRouteResolution<StressRouteToken>[] => {
  const seen = new Map<string, DiscriminatedRouteResolution<StressRouteToken>>();
  for (const route of routes) {
    seen.set(route, resolveRoutes([route])[0]);
  }
  return [...seen.values()];
};

export const resolveRouteByToken = <T extends StressRouteToken>(route: T): DiscriminatedRouteResolution<T> => {
  const [resolved] = resolveRoutes([route] as const);
  return resolved;
};
