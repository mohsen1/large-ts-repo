import { NoInfer } from './stress-instantiation-overload-hub';
import { RouteTuple } from './stress-conditional-distribution-grid';
import { RouteTupleLike } from './stress-recursive-constraint-lattice';

export type StressHubScope = {
  readonly tenantId: string;
  readonly namespace: string;
  readonly route: RouteTupleLike;
  readonly timestamp: number;
};

export type StressHubRouteProfile = {
  readonly raw: RouteTuple;
  readonly domain: 'atlas' | 'drill' | 'risk' | 'timeline' | 'incident' | 'control' | 'workflow';
  readonly action: string;
  readonly scope: string;
  readonly domainProfile: {
    readonly scope: string;
    readonly tier: number;
    readonly criticality: 'low' | 'medium' | 'high' | 'critical';
  };
  readonly actionProfile: {
    readonly stage: string;
    readonly weight: number;
  };
};

type BootstrapRoutes = readonly ['atlas/bootstrap/seed', 'drill/simulate/seed'];

export type StressHubEnvelope<TContext extends object = Record<string, unknown>> = {
  readonly tenantId: string;
  readonly namespace: string;
  readonly context: TContext;
  readonly runId: string;
  readonly phase: 'bootstrap' | 'active' | 'drain';
  readonly featureFlags: Readonly<Record<string, boolean>>;
  readonly route: RouteTupleLike;
};

export type StressHubCatalog = {
  readonly routes: BootstrapRoutes;
  readonly routeProfiles: readonly StressHubRouteProfile[];
  readonly plugins: readonly Readonly<{ readonly kind: string; readonly scope: string }>[];
};

const bootstrapCatalog: readonly RouteTuple[] = [
  'atlas/bootstrap/seed',
  'drill/simulate/seed',
  'risk/verify/seed',
  'timeline/execute/seed',
] as const;

const parseResolvedRouteProfile = (route: RouteTuple): StressHubRouteProfile => {
  const [domain, action, scope] = route.split('/') as [string, string, string];
  return {
    raw: route,
    domain: domain as any,
    action: action as any,
    scope,
    domainProfile: {
      scope: 'catalog',
      tier: 1,
      criticality: 'low',
    },
    actionProfile: {
      stage: 'begin',
      weight: 1,
    },
  } as StressHubRouteProfile;
};

class AsyncHarnessGuard {
  async [Symbol.asyncDispose](): Promise<void> {
    await Promise.resolve(undefined);
  }
}

export const collectStressHubProfiles = async (scope: string): Promise<StressHubCatalog> => {
  const profiles: StressHubRouteProfile[] = bootstrapCatalog.map((route) => ({
    ...parseResolvedRouteProfile(route),
    scope,
  }));
  return {
    routes: ['atlas/bootstrap/seed', 'drill/simulate/seed'] as BootstrapRoutes,
    routeProfiles: profiles,
    plugins: [{ kind: 'stress-hub', scope }],
  };
};

const buildRunId = (tenantId: string, namespace: string, planSeed: string): string =>
  `${tenantId}:${namespace}:${planSeed}`;

export const buildStressHubEnvelope = <TContext extends object>(
  tenantId: string,
  namespace: string,
  planSeed: string,
  context: TContext,
): StressHubEnvelope<TContext> => ({
  tenantId,
  namespace,
  context,
  runId: buildRunId(tenantId, namespace, planSeed),
  phase: 'bootstrap',
  featureFlags: { stress: true },
  route: 'atlas/bootstrap/seed',
});

export const createStressHubScope = async <TContext extends object>(
  tenantId: string,
  _context: TContext,
): Promise<StressHubScope> => {
  await using _guard = new AsyncHarnessGuard();
  const routes = await collectStressHubProfiles('stress-hub');
  return {
    tenantId,
    namespace: `tenant:${tenantId}:${routes.routeProfiles.length}`,
    route: routes.routes[0],
    timestamp: Date.now(),
  };
};

export const withStressRouteTuple = <T, TRoute extends string>(
  value: T,
  route: NoInfer<TRoute>,
): readonly [T, TRoute] => [value, route];

export const runStressHubSession = async <TContext extends object>(
  tenantId: string,
  context: TContext,
  scope: string,
): Promise<{
  readonly id: string;
  readonly scope: string;
  readonly payload: StressHubEnvelope<TContext>;
}> => {
  await using stack = new AsyncDisposableStack();
  stack.defer(async () => {
    await Promise.resolve('drain');
  });
  const payload = buildStressHubEnvelope(tenantId, scope, 'run-bootstrap', context);
  return {
    id: buildRunId(tenantId, scope, payload.runId),
    scope,
    payload,
  };
};
