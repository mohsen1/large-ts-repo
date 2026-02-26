import type { NoInfer } from '@shared/type-level';
import {
  buildFacetCatalog,
  segmentBag,
  type RouteFacet,
  type RouteSegmentBag,
  type FacetCatalog,
  type FacetToken,
} from '@shared/type-level-hub';
import type { MeshWorkspaceId } from './stress-lab-orchestration';

type RawRoute =
  | '/signal/observe/event'
  | '/policy/resolve/rules'
  | '/fabric/mesh/cluster'
  | '/policy/dispatch/plan';

const rawCatalog = {
  signal: '/signal/observe/event',
  policy: '/policy/resolve/rules',
  fabric: '/fabric/mesh/cluster',
  drift: '/policy/dispatch/plan',
} as const satisfies Record<string, RawRoute>;

export type LabRoute = RouteFacet;
export type LabRouteRecord = FacetCatalog<typeof rawCatalog>;
export type LabSegmentList = RouteSegmentBag<[
  '/signal/observe/event',
  '/policy/resolve/rules',
  '/fabric/mesh/cluster',
  '/policy/dispatch/plan',
]>;

export type RouterState = {
  readonly workspaceId: MeshWorkspaceId;
  readonly routeStack: readonly LabRoute[];
  readonly tokens: readonly FacetToken<keyof typeof rawCatalog & string>[];
};

export const buildLabRouterCatalog = (): LabRouteRecord => {
  return buildFacetCatalog(rawCatalog);
};

export const labSegments = segmentBag([
  '/signal/observe/event',
  '/policy/resolve/rules',
  '/fabric/mesh/cluster',
  '/policy/dispatch/plan',
]);

export const routeProfiles = (route: RouteFacet): number => {
  if (route.includes('/signal/')) return 1;
  if (route.includes('/policy/')) return 2;
  if (route.includes('/fabric/')) return 3;
  if (route.includes('/drift/')) return 4;
  return 5;
};

export const classifyRoute = (route: RouteFacet): 'low' | 'medium' | 'high' | 'critical' => {
  const score = routeProfiles(route);
  if (score <= 1) return 'low';
  if (score === 2) return 'medium';
  if (score === 3) return 'high';
  return 'critical';
};

export const routeDecisionToTemplate = (route: RouteFacet): LabRoute => {
  return route;
};

export const routeReducer = (
  initial: readonly RouteFacet[],
  workspaceId: MeshWorkspaceId,
  signal: NoInfer<RouterSignal>,
): RouterState => {
  const tokens = buildLabRouterCatalog();
  const ordered = [...initial].sort((left, right) => {
    const leftScore = routeProfiles(left);
    const rightScore = routeProfiles(right);
    return rightScore - leftScore;
  });

  if (signal === 'ingest') {
    ordered.push('/signal/observe/event' as RouteFacet);
  }
  if (signal === 'activate') {
    ordered.push('/fabric/mesh/cluster' as RouteFacet);
  }
  if (signal === 'drain') {
    ordered.push('/policy/resolve/rules' as RouteFacet);
  }
  if (signal === 'simulate') {
    ordered.push('/policy/dispatch/plan' as RouteFacet);
  }

  const merged = [...new Set(ordered)] as readonly RouteFacet[];

  return {
    workspaceId,
    routeStack: merged.map(routeDecisionToTemplate),
    tokens: Object.keys(tokens).map((token) => token as unknown as FacetToken<keyof typeof tokens & string>),
  };
};

export type RouterSignal = 'ingest' | 'activate' | 'drain' | 'simulate';

export const routeSwitch = (signal: RouterSignal): RouteFacet[] => {
  switch (signal) {
    case 'ingest':
      return ['/signal/observe/event', '/policy/resolve/rules'];
    case 'activate':
      return ['/fabric/mesh/cluster', '/policy/dispatch/plan'];
    case 'drain':
      return ['/signal/observe/event'];
    case 'simulate':
      return ['/policy/resolve/rules', '/fabric/mesh/cluster'];
    default:
      return [];
  }
};

export const routeStateLabel = (state: RouterState): string => `${state.workspaceId}:${state.routeStack.length}:${state.tokens.length}`;

export const assertState = (state: RouterState): state is RouterState => {
  if (state.routeStack.length === 0) return false;
  if (state.tokens.length === 0) return false;
  if (state.workspaceId.length < 3) return false;
  return true;
};
