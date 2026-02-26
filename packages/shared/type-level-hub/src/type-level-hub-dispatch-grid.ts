import type {
  StormRoute,
  StormDomain,
  StormVerb,
  StormSeverity,
  StormId,
  RouteResolutionProfile,
} from '@shared/type-level/stress-conditional-union-storm';
import {
  RouteTemplate,
  routeSignatureCatalog,
} from '@shared/type-level/stress-template-route-cosmos';
import type { DecisionMap } from '@shared/type-level/stress-binary-expression-cascade';
import {
  type ProtoLayer1,
  type LayeredHierarchy,
  walkHierarchyDepth,
  deepChainNode,
} from '@shared/type-level/stress-subtype-depth-chains';
import { buildInvocationMatrix, type InvocationResult } from '@shared/type-level/stress-generic-instantiation-atoll';
import { type IntersectedCatalog, type CatalogBlueprint, type CatalogSignature } from '@shared/type-level/stress-safe-intersection-fabric';

export type StressHubRoute = StormRoute | RouteTemplate;
export type StressHubDomain = StormDomain;
export type StressHubVerb = StormVerb;
export type StressHubSeverity = StormSeverity;
export type StressHubRouteId = StormId;

export type StormHubResolution = {
  readonly route: StormRoute;
  readonly domain: string;
  readonly verb: string;
  readonly severity: string;
  readonly id: string;
  readonly signal: string;
  readonly policy: { readonly escalation: string; readonly timeoutSec: number };
  readonly verbProfile: { readonly verbTier: number; readonly synchronous: boolean };
};

export interface HubDispatchEnvelope {
  readonly tenant: string;
  readonly version: 'v1' | 'v2';
  readonly routes: readonly StressHubRoute[];
  readonly metadata: {
    readonly created: string;
    readonly labels: readonly string[];
  };
}

export interface HubRouteProjection {
  readonly entity: string;
  readonly action: string;
  readonly severity: string;
  readonly id: string;
  readonly mode: string;
  readonly domain: string;
  readonly signature: string;
}

export type HubRouteMap = {
  [key: string]: HubRouteProjection;
};

export interface HubTemplateMap {
  readonly domain: Readonly<Record<string, readonly RouteTemplate[]>>;
  readonly routeSignature: string;
  readonly expression: number;
  readonly decision: DecisionMap;
}

export interface HubLifecycleState<TNode extends ProtoLayer1 = ProtoLayer1> {
  readonly root: TNode['tier'];
  readonly walked: LayeredHierarchy<TNode>;
  readonly node: string;
}

export const resolveRouteTemplates = (routes: readonly StressHubRoute[]): HubRouteMap => {
  const output: HubRouteMap = {};

  for (const route of routes) {
    output[route] = {
      entity: route,
      action: 'discover',
      severity: 'medium',
      id: route,
      mode: 'default',
      domain: 'ops',
      signature: `${route}:signature`,
    };
  }

  return output;
};

const routeCatalog: readonly StressHubRoute[] = [
  '/incident/discover/low/R01',
  '/workload/repair/high/R02',
  '/fabric/route/medium/R03',
  '/timeline/assess/low/R04',
  '/policy/stabilize/high/R05',
];

export const buildHubDispatchCatalog = (): HubDispatchEnvelope => {
  const routes = routeCatalog.slice(0, 4);
  const labels = routes
    .map((entry) => `${entry}-L`)
    .slice(0, 2);

  return {
    tenant: 'tenant-hub',
    version: 'v2',
    routes,
    metadata: {
      created: new Date().toISOString(),
      labels,
    },
  };
};

const dispatchCatalog = buildHubDispatchCatalog();

export type Invocations = InvocationResult<unknown, 'discover', unknown>;

export const buildHubInvocations = () =>
  buildInvocationMatrix(
    [
      { input: dispatchCatalog.routes[0] ?? '', tag: 'discover', seed: { tenant: 'incident' }, issuedAt: 1 },
      { input: dispatchCatalog.routes[1] ?? '', tag: 'assess', seed: { tenant: 'workload' }, issuedAt: 2 },
    ] as const,
    ['strict', 'adaptive', 'maintenance'] as const,
  ) as readonly Invocations[];

export type HubTemplateProjection = HubTemplateMap;

export interface HubDispatchProfile {
  readonly chain: StormHubResolution;
  readonly hierarchy: HubLifecycleState<ProtoLayer1>;
  readonly catalogs: HubTemplateProjection;
}

export const createHubProfile = (route: StressHubRoute): HubDispatchProfile => {
  const chain = {} as StormHubResolution;
  const hierarchy = {
    root: deepChainNode.getScope(),
    walked: walkHierarchyDepth({
      tier: 'L1',
      marker: 1,
      depth1: 1,
      layerHash: 'h1',
    } as ProtoLayer1),
    node: String(route),
  };

  const catalog: HubTemplateProjection = {
    domain: routeSignatureCatalog as unknown as HubTemplateProjection['domain'],
    routeSignature: 'stormgraphatlasruntime',
    expression: 10,
    decision: { trueAndTrue: true, trueOrFalse: true },
  };

  return {
    chain,
    hierarchy,
    catalogs: catalog,
  };
};

export const atlasBundle = {
  routeSet: dispatchCatalog.routes,
  profile: createHubProfile(dispatchCatalog.routes[0] ?? '/incident/discover/medium/R-100'),
  inventory: buildHubInvocations(),
  intersectionCatalog: [{ tenant: 'tenant-north', region: 'north', active: true, partition: 'north' }] as readonly IntersectedCatalog<string>[],
  catalogBlueprint: [] as CatalogBlueprint[],
  catalogSignature: { domains: ['tenant-north'], regions: ['north'] } as unknown as CatalogSignature<readonly IntersectedCatalog<string>[]>,
} as const;

export const hubDispatchIndex = atlasBundle;
