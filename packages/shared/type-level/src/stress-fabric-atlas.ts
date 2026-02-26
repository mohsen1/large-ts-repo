import {
  buildCatalogFromSpec,
  buildLatticeCarrier,
  buildRecursiveRouteSet,
  buildRouteTree,
  mapRoutePayload,
  parseRouteToken,
  routeBlueprintCatalog,
  routePairs,
  routeSpecFromTemplate,
  routeTokenCatalog,
  resolveRouteToken,
  type BuildRoutePairCatalog,
  type BuildRouteTree,
  type LatticeAF,
  type RouteCatalogMap,
  type RouteDispatchResult,
  type RouteLookupByVerb,
  type RouteSpec,
  type RouteToken,
} from '@shared/type-level-fabric';

import type { DeepInterfaceChain } from './stress-types';

type AtlasRouteTuple = {
  readonly verb: RouteSpec['verb'];
  readonly entity: RouteSpec['entity'];
  readonly severity: RouteSpec['severity'];
  readonly routeId: string;
  readonly source: 'fabric';
};

export type AtlasBranch =
  | 'recover'
  | 'dispatch'
  | 'observe'
  | 'simulate'
  | 'reconcile'
  | 'drill';

export type AtlasRouteCatalog = RouteCatalogMap<readonly RouteSpec[]>;
export type AtlasPairs = BuildRoutePairCatalog<readonly RouteSpec['entity'][], readonly RouteSpec['verb'][]>;
export type AtlasTree = BuildRouteTree<
  readonly ['incident', 'mesh', 'policy', 'playbook'],
  'recover',
  '',
  []
>;

export const atlasCatalog = mapRoutePayload(
  Object.values(routeBlueprintCatalog).slice(0, 8) as RouteSpec[],
) as RouteCatalogMap<readonly RouteSpec[]>;

export const atlasRouteTree: AtlasTree = buildRouteTree(
  ['incident', 'mesh', 'policy', 'playbook'] as const,
  'recover',
) as unknown as AtlasTree;

export const atlasRouteLookup: RouteLookupByVerb<RouteSpec[], 'recover'> = atlasCatalog as RouteLookupByVerb<RouteSpec[], 'recover'>;

export const atlasTokenMap = (tokens: readonly RouteToken<RouteSpec['verb'], RouteSpec['entity'], RouteSpec['severity'], string>[]) =>
  tokens.map((token) => parseRouteToken(token));

export const atlasPairCatalog: AtlasPairs = routePairs(
  ['incident', 'mesh', 'signal', 'policy', 'scheduler'] as const,
  ['recover', 'dispatch', 'observe', 'simulate', 'drill'] as const,
) as AtlasPairs;

export const atlasDispatchedPayload = (input: AtlasRouteTuple): RouteDispatchResult<RouteSpec> => {
  const spec = buildCatalogFromSpec({
    verb: input.verb,
    entity: input.entity,
    severity: input.severity,
    routeId: input.routeId,
    source: input.source,
  });

  return {
    kind: 'dispatch',
    payload: spec,
    transport: 'http',
    accepted: input.source === 'fabric',
  };
};

export const atlasTemplates = (raw: readonly string[]) =>
  raw
    .filter((token): token is RouteToken<RouteSpec['verb'], RouteSpec['entity'], RouteSpec['severity'], string> => token.includes(':'))
    .map((token) => {
      const parsed = parseRouteToken(token);
      return {
        token,
        resolved: resolveRouteToken(parsed.token as unknown as RouteToken<RouteSpec['verb'], RouteSpec['entity'], RouteSpec['severity'], string>),
      };
    });

export const atlasRuntime = async (routeCount: number): Promise<{
  readonly catalogLength: number;
  readonly routeMapKeys: number;
  readonly parsedCount: number;
  readonly routeTree: AtlasTree;
}> => {
  const catalog = mapRoutePayload(
    Object.values(routeBlueprintCatalog).slice(0, routeCount) as RouteSpec[],
  ) as AtlasRouteCatalog;

  const pairs = await buildRecursiveRouteSet(
    routeTokenCatalog.map((token) => `${token}`),
  );

  const parsed = atlasTokenMap(routeTokenCatalog);

  return {
    catalogLength: Object.keys(catalog).length + Object.keys(atlasRouteLookup).length,
    routeMapKeys: Object.keys(routeBlueprintCatalog).length,
    parsedCount: parsed.length + pairs.length,
    routeTree: atlasRouteTree,
  };
};

const branchPriority = (branch: AtlasBranch): number =>
  branch === 'recover'
    ? 1
    : branch === 'dispatch'
      ? 2
      : branch === 'observe'
        ? 3
        : branch === 'simulate'
          ? 4
          : 5;

export const atlasFlow = (
  branch: AtlasBranch,
  chain: DeepInterfaceChain,
): {
  readonly state: AtlasBranch;
  readonly routeCount: number;
  readonly chainDepth: number;
  readonly tree: AtlasTree;
} => {
  let state = branch;
  const routeCount = Object.keys(routeBlueprintCatalog).length;

  if (chain.layerB) {
    state = 'recover';
  }
  if (routeCount > 10) {
    state = branchPriority(state) < 3 ? 'dispatch' : state;
  }
  if (routeCount > 20) {
    state = state === 'dispatch' ? 'observe' : state;
  }
  if (routeCount > 30) {
    state = state === 'observe' ? 'simulate' : state;
  }

  return {
    state,
    routeCount,
    chainDepth: 32,
    tree: atlasRouteTree,
  };
};

export const atlasCarrier = (seed: LatticeAF): ReturnType<typeof buildLatticeCarrier> => {
  return buildLatticeCarrier(seed);
};

export const atlasTemplateRoute = routeSpecFromTemplate('/recovery/incident/f1/recover');

export {
  atlasRouteTree as sampleAtlasTree,
  atlasRouteLookup as atlasLookupByVerb,
  atlasPairCatalog as atlasRoutePairs,
  atlasDispatchedPayload as dispatchAtlasPayload,
};
