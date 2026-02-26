import {
  type OrbitAction,
  type OrbitDomain,
  type OrbitRoute,
  type OrbitScope,
  type RouteByDomain,
  type RouteEnvelope,
} from '@shared/type-level/stress-conditional-orbit';
import { type DeepLayerChain } from '@shared/type-level/stress-deep-hierarchy-lattice';
import { type NoInfer } from '@shared/type-level/patterns';

export type BrandedId<T extends string> = T & { readonly __brand: 'stress-id' };

export type StressDomain = OrbitDomain;
export type StressAction = OrbitAction;
export type StressScope = OrbitScope;

export type StressRoute = OrbitRoute;

export type StressBundle =
  | {
      readonly kind: 'plan';
      readonly domain: StressDomain;
      readonly route: StressRoute;
      readonly priority: 'critical' | 'high' | 'medium' | 'low';
    }
  | {
      readonly kind: 'telemetry';
      readonly domain: StressDomain;
      readonly route: StressRoute;
      readonly count: number;
    };

export type StressRouteCatalog = {
  [K in keyof RouteByDomain]: {
    readonly key: K;
    readonly bundle: RouteByDomain[K];
  };
};

export type RouteEnvelopeCatalog = {
  [K in StressRoute]: RouteEnvelope<K>;
};

export type StressEnvelopePayload = {
  readonly tenant: BrandedId<`${string}:${string}`>;
  readonly route: StressRoute;
  readonly bundle: StressBundle;
  readonly layers: DeepLayerChain;
  readonly scope: StressScope;
};

export interface StressWorkspaceState {
  readonly workspace: BrandedId<string>;
  readonly tenant: BrandedId<string>;
  readonly region: string;
  readonly active: boolean;
}

export interface StressAdapter<TPayload> {
  readonly domain: StressDomain;
  readonly action: StressAction;
  readonly route: StressRoute;
  readonly apply: (payload: NoInfer<TPayload>) => Promise<StressBundle>;
}

export interface StressAdapterRegistry {
  readonly byRoute: Record<StressRoute, RouteEnvelope<StressRoute>>;
  readonly adapters: readonly StressAdapter<StressEnvelopePayload>[];
  add<T extends StressAdapter<StressEnvelopePayload>>(adapter: NoInfer<T>): void;
  find(route: StressRoute): StressAdapter<StressEnvelopePayload> | undefined;
}

export const stressBundleSeed: StressBundle[] = [
  {
    kind: 'plan',
    domain: 'quantum',
    route: '/quantum/simulate/runtime',
    priority: 'high',
  },
  {
    kind: 'telemetry',
    domain: 'signal',
    route: '/signal/observe/edge',
    count: 12,
  },
] as const;

export const stressWorkspaceStateSeed = {
  workspace: 'ws-quantum-01' as BrandedId<'ws-quantum-01'>,
  tenant: 'tenant-zenith' as BrandedId<'tenant-zenith'>,
  region: 'us-east-1',
  active: true,
} satisfies StressWorkspaceState;

export const createAdapter = <
  TInput,
  TOutput extends StressBundle,
>(adapter: {
  domain: StressDomain;
  action: StressAction;
  route: StressRoute;
  invoke: (input: NoInfer<TInput>) => Promise<TOutput>;
}): StressAdapter<TInput> => ({
  domain: adapter.domain,
  action: adapter.action,
  route: adapter.route,
  apply: adapter.invoke,
});

export const routeEnvelopeFromBundle = <T extends StressBundle>(bundle: T): RouteEnvelope<T['route'] & StressRoute> => {
  if (bundle.route === '/quantum/simulate/runtime') {
    return {
      path: bundle.route,
      scope: 'runtime',
      stage: 'steady',
      priority: 'high',
      resource: 'engine',
    } as RouteEnvelope<T['route'] & StressRoute>;
  }

  return {
    path: bundle.route,
    scope: 'global',
    stage: 'ready',
    priority: 'medium',
    resource: 'manifest',
  } as RouteEnvelope<T['route'] & StressRoute>;
};

export const resolveRouteState = (route: StressRoute, catalog: RouteEnvelope<StressRoute>): 'live' | 'idle' | 'error' => {
  if (catalog.scope === 'runtime') {
    return 'live';
  }

  if (catalog.scope === 'control-plane' || catalog.scope === 'surface') {
    return 'live';
  }

  if (catalog.resource === 'policy' || catalog.resource === 'session') {
    return route.includes('guard') ? 'live' : 'error';
  }

  if (route.includes('fabric')) {
    return route.includes('replay') ? 'live' : 'idle';
  }

  if (catalog.resource === 'policy') {
    return route.includes('guard') ? 'live' : 'error';
  }

  return 'idle';
};
