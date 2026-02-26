import type { NoInfer } from '@shared/type-level/stress-instantiation-overload-hub';
import type { RouteTuple } from '@shared/type-level/stress-conditional-distribution-grid';
import type { RouteTupleLike } from '@shared/type-level/stress-recursive-constraint-lattice';
import type { PluginByKind, WorkspaceEnvelope } from './advanced-lab-core';
import { buildRuntimeId, buildPlanId, buildWorkspaceEnvelope, type WorkspaceInput } from './advanced-lab-core';

export type StressHubScope = {
  readonly tenantId: string;
  readonly namespace: string;
  readonly route: RouteTupleLike;
  readonly timestamp: number;
};

export type StressHubRouteProfile = {
  readonly raw: RouteTuple;
  readonly domain: string;
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

export type StressHubEnvelope<TContext extends object = Record<string, unknown>> = WorkspaceEnvelope<
  TContext,
  Record<string, unknown>
>;

type BootstrapRoutes = readonly ['atlas/bootstrap/seed', 'drill/simulate/seed'];

export type StressHubCatalog = {
  readonly routes: BootstrapRoutes;
  readonly routeProfiles: readonly StressHubRouteProfile[];
  readonly plugins: readonly PluginByKind<any>[];
};

const bootstrapCatalog: readonly RouteTuple[] = [
  'atlas/bootstrap/seed',
  'drill/simulate/seed',
  'risk/verify/seed',
  'timeline/execute/seed',
] as const satisfies readonly RouteTuple[];

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
  const catalog: StressHubCatalog = {
    routes: ['atlas/bootstrap/seed', 'drill/simulate/seed'] as BootstrapRoutes,
    routeProfiles: profiles,
    plugins: [],
  };
  return catalog;
};

export const buildStressHubEnvelope = <TContext extends object>(
  tenantId: string,
  namespace: string,
  planSeed: string,
  context: TContext,
): StressHubEnvelope<TContext> => {
  const planId = buildPlanId(tenantId, namespace as any, planSeed);
  const workspace = buildWorkspaceEnvelope(
    tenantId,
    namespace as WorkspaceInput<TContext>['namespace'],
    planId,
    context,
    {
      timeoutMs: 15_000,
      maxConcurrency: 8,
      retryWindowMs: 10_000,
      featureFlags: { stress: true },
    },
  );
  return workspace as StressHubEnvelope<TContext>;
};

export const createStressHubScope = async <TContext extends object>(
  tenantId: string,
  context: TContext,
): Promise<StressHubScope> => {
  await using _guard = new AsyncHarnessGuard();
  const routes = await collectStressHubProfiles('stress-hub');
  return {
    tenantId,
    namespace: `tenant:${tenantId}:${routes.routeProfiles.length}`,
    route: routes.routes[0] as RouteTupleLike,
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
  id: ReturnType<typeof buildRuntimeId>;
  scope: string;
  payload: StressHubEnvelope<TContext>;
}> => {
  const stack = new AsyncDisposableStack();
  stack.defer(async () => {
    await stack.adopt(
      {
        async [Symbol.asyncDispose]() {
          return;
        },
      },
      async () => {
        await Promise.resolve('release');
      },
    );
  });
  const payload = buildStressHubEnvelope(tenantId, scope, 'run-bootstrap', context);
  const id = buildRuntimeId(tenantId, `${scope}-${payload.runId}`, payload.namespace);
  return { id, scope, payload };
};
