import type { Brand } from '@shared/type-level';
import { buildPluginBundle, type PluginBundle, type RuntimeResult, type AdapterSignal } from './adaptor-factory';

export type AtlasAction = 'bootstrap' | 'simulate' | 'stabilize' | 'rollback' | 'snapshot';

export type AtlasRoute = `/atlas/${AtlasAction}/${string}/${string}`;
export type AtlasSignal = AdapterSignal<'atlas'>;

export type AtlasRegistryInput = {
  readonly tenant: string;
  readonly action: AtlasAction;
  readonly target: string;
  readonly confidence: number;
};

export type AtlasEnvelope<T extends AtlasRegistryInput> = {
  readonly id: Brand<T['tenant'], 'AtlasTenant'>;
  readonly route: AtlasRoute;
  readonly payload: T;
  readonly result: RuntimeResult<'atlas', T> | undefined;
};

export type AtlasChain<T extends readonly AtlasRegistryInput[]> = {
  [K in keyof T]: AtlasEnvelope<T[K]>;
};

export type AtlasSession<T extends AtlasRegistryInput> = {
  readonly id: Brand<T['tenant'], 'AtlasSession'>;
  readonly state: 'idle' | 'running' | 'complete' | 'error';
  readonly tags: readonly string[];
};

export type AtlasState<T extends readonly AtlasRegistryInput[]> = {
  readonly active: boolean;
  readonly version: number;
  readonly index: AtlasIndex<T>;
};

export type AtlasUnion<T extends readonly AtlasRegistryInput[]> = T[number];
export type AtlasRouteKeys<T extends readonly AtlasRegistryInput[]> = AtlasUnion<T>['tenant'];

export type AtlasIndex<T extends readonly AtlasRegistryInput[]> = {
  [K in AtlasRouteKeys<T> & string]: AtlasEnvelope<Extract<AtlasUnion<T>, { tenant: K }>>;
};

export type AtlasCatalog<T extends readonly AtlasRoute[]> = {
  readonly routes: {
    [K in T[number] as K & string]: AtlasEnvelope<{
      tenant: string;
      action: AtlasAction;
      target: string;
      confidence: number;
    }>;
  };
};

export type AtlasFacet = `/${string}/${string}/${string}`;
export type AtlasFacetCatalog<T extends Record<string, AtlasFacet>> = {
  [K in keyof T & string]: {
    readonly id: K;
    readonly route: T[K];
    readonly domain: string;
    readonly action: string;
  };
};

export const parseAtlasRoute = <T extends AtlasRoute>(route: T): {
  readonly tenant: string;
  readonly action: AtlasAction;
  readonly target: string;
} => {
  const [, tenant, action, target] = route.split('/') as [string, string, AtlasAction, string, ...string[]];
  return { tenant, action, target };
};

export const toAtlasRoute = (input: AtlasRegistryInput): AtlasRoute =>
  `/atlas/${input.action}/${input.tenant}/${input.target}` as AtlasRoute;

export const atlasFacetCatalog = <T extends Record<string, AtlasFacet>>(input: T): AtlasFacetCatalog<T> => {
  const out = {} as AtlasFacetCatalog<T>;
  for (const key of Object.keys(input) as Array<keyof T & string>) {
    const route = input[key];
    const [, domain, action] = route.split('/') as [string, string, string, string];
    out[key] = {
      id: key,
      route,
      domain,
      action,
    };
  }
  return out;
};

export type AtlasFacetBag = {
  readonly domain: string;
  readonly action: string;
  readonly resource: string;
};

export const atlasRouteBag = (routes: readonly AtlasFacet[]): readonly AtlasFacetBag[] =>
  routes.map((route) => {
    const [, domain, action, resource] = route.split('/') as [string, string, string, string];
    return { domain, action, resource };
  });

export const buildAtlasIndex = <const T extends readonly AtlasRegistryInput[]>(items: T): AtlasIndex<T> => {
  const index = items.reduce<Record<string, AtlasEnvelope<AtlasRegistryInput>>>((acc, entry) => {
    const route = toAtlasRoute(entry);
    acc[entry.tenant] = {
      id: `${entry.tenant}-${entry.action}` as Brand<string, 'AtlasTenant'>,
      route,
      payload: entry,
      result: {
        signal: 'atlas' as AtlasSignal,
        payload: entry,
        metadata: {
          route: entry.target,
          tenant: entry.tenant,
        },
      },
    };
    return acc;
  }, {});

  return index as unknown as AtlasIndex<T>;
};

export const createAtlasState = <const T extends readonly AtlasRegistryInput[]>(items: T): AtlasState<T> => ({
  active: true,
  version: items.length,
  index: buildAtlasIndex(items),
});

export const mapAtlasState = <T extends readonly AtlasRegistryInput[]>(state: AtlasState<T>): number =>
  Object.keys(state.index).length + state.version;

export const routeFromParts = (parts: { tenant: string; action: AtlasAction; target: string }): AtlasRoute =>
  `/atlas/${parts.action}/${parts.tenant}/${parts.target}`;

export const dispatchAtlasPayload = <T extends AtlasRegistryInput>(payload: T): RuntimeResult<'atlas', T> => {
  if (!payload.tenant || !payload.target) {
    return {
      signal: 'atlas' as AtlasSignal,
      payload,
      metadata: { route: '/atlas/invalid' },
    };
  }

  return {
    signal: 'atlas' as AtlasSignal,
    payload,
    metadata: { route: toAtlasRoute(payload) },
  };
};

export const buildAtlasChain = <const T extends readonly AtlasRegistryInput[]>(items: T): AtlasChain<T> => {
  const chain = items.map((item) => ({
    id: `${item.tenant}:${item.target}` as Brand<string, 'AtlasTenant'>,
    route: toAtlasRoute(item),
    payload: item,
    result: dispatchAtlasPayload(item),
  }));
  return chain as AtlasChain<T>;
};

export const buildFacetRegistry = <
  const T extends readonly AtlasRegistryInput[],
>(items: T): ReadonlyMap<string, { tenant: string; action: AtlasAction; route: AtlasRoute }> => {
  const out = new Map<string, { tenant: string; action: AtlasAction; route: AtlasRoute }>();
  for (const item of items) {
    const route = toAtlasRoute(item);
    out.set(item.tenant, {
      tenant: item.tenant,
      action: item.action,
      route,
    });
  }
  return out;
};

export const runAtlasPipeline = async <const T extends readonly AtlasRegistryInput[]>(items: T): Promise<AtlasChain<T>> => {
  const state = createAtlasState(items);
  if (!state.active) {
    return [] as AtlasChain<T>;
  }

  const session: AtlasSession<AtlasRegistryInput> = {
    id: 'atlas-session' as Brand<string, 'AtlasSession'>,
    state: 'running',
    tags: ['atlas', 'stress'],
  };
  await Promise.resolve(session);
  return buildAtlasChain(items);
};

export const bundleAtlas = <T extends readonly AtlasRegistryInput[]>(
  items: T,
): PluginBundle<'atlas', T[number], RuntimeResult<'atlas', T[number]>> => {
  const adapters = items.map((item) => ({
    id: `${item.tenant}-adapter` as Brand<string, 'AdapterId'>,
    signature: 'atlas',
    invoke: async () => ({ ok: true, value: dispatchAtlasPayload(item) }),
  }));

  return buildPluginBundle('atlas', adapters as never);
};

export const routeFromFacets = (routes: ReadonlySet<string>): AtlasFacet[] => {
  const list = Array.from(routes.values());
  return list.filter((entry): entry is AtlasFacet => entry.startsWith('/'));
};

export const atlasManifest = <T extends AtlasRegistryInput>(value: T): AtlasEnvelope<T> => ({
  id: `${value.tenant}-${value.action}` as Brand<T['tenant'], 'AtlasTenant'>,
  route: toAtlasRoute(value),
  payload: value,
  result: {
    signal: 'atlas' as AtlasSignal,
    payload: value,
    metadata: { route: value.target, tenant: value.tenant },
  },
});

export const atlasCatalog: AtlasCatalog<readonly [
  '/atlas/bootstrap/global/seed',
  '/atlas/simulate/global/forecast',
  '/atlas/stabilize/global/region',
  '/atlas/rollback/global/incident-01',
  '/atlas/snapshot/global/point-in-time',
]> = {
  routes: {
    '/atlas/bootstrap/global/seed': {
      id: 'global-bootstrap' as Brand<'global', 'AtlasTenant'>,
      route: '/atlas/bootstrap/global/seed',
      payload: {
        tenant: 'global',
        action: 'bootstrap',
        target: 'seed',
        confidence: 1,
      },
      result: {
        signal: 'atlas' as AtlasSignal,
        payload: { tenant: 'global', action: 'bootstrap', target: 'seed', confidence: 1 },
        metadata: { route: 'bootstrap', tenant: 'global' },
      },
    },
    '/atlas/simulate/global/forecast': {
      id: 'global-simulate' as Brand<'global', 'AtlasTenant'>,
      route: '/atlas/simulate/global/forecast',
      payload: {
        tenant: 'global',
        action: 'simulate',
        target: 'forecast',
        confidence: 1,
      },
      result: {
        signal: 'atlas' as AtlasSignal,
        payload: { tenant: 'global', action: 'simulate', target: 'forecast', confidence: 1 },
        metadata: { route: 'simulate', tenant: 'global' },
      },
    },
    '/atlas/stabilize/global/region': {
      id: 'global-stabilize' as Brand<'global', 'AtlasTenant'>,
      route: '/atlas/stabilize/global/region',
      payload: {
        tenant: 'global',
        action: 'stabilize',
        target: 'region',
        confidence: 1,
      },
      result: {
        signal: 'atlas' as AtlasSignal,
        payload: { tenant: 'global', action: 'stabilize', target: 'region', confidence: 1 },
        metadata: { route: 'stabilize', tenant: 'global' },
      },
    },
    '/atlas/rollback/global/incident-01': {
      id: 'global-rollback' as Brand<'global', 'AtlasTenant'>,
      route: '/atlas/rollback/global/incident-01',
      payload: {
        tenant: 'global',
        action: 'rollback',
        target: 'incident-01',
        confidence: 1,
      },
      result: {
        signal: 'atlas' as AtlasSignal,
        payload: { tenant: 'global', action: 'rollback', target: 'incident-01', confidence: 1 },
        metadata: { route: 'rollback', tenant: 'global' },
      },
    },
    '/atlas/snapshot/global/point-in-time': {
      id: 'global-snapshot' as Brand<'global', 'AtlasTenant'>,
      route: '/atlas/snapshot/global/point-in-time',
      payload: {
        tenant: 'global',
        action: 'snapshot',
        target: 'point-in-time',
        confidence: 1,
      },
      result: {
        signal: 'atlas' as AtlasSignal,
        payload: { tenant: 'global', action: 'snapshot', target: 'point-in-time', confidence: 1 },
        metadata: { route: 'snapshot', tenant: 'global' },
      },
    },
  },
};
