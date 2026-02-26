import {
  atlasCatalogLookup,
  type AtlasChainResult,
  type AtlasCatalogLookup,
  type AtlasRoute,
  type AtlasRouteUnion,
} from '@shared/type-level';
import { type RouteTemplate } from '@shared/type-level/stress-template-route-grammar';
import { type RouteValueProjection } from '@shared/type-level/stress-conditional-orchestration-atlas';

export type HubConsoleRouteUnion = AtlasRouteUnion;
export type HubConsoleTemplateUnion = RouteTemplate;
export type HubConsoleDecision = {
  readonly route: HubConsoleRouteUnion;
  readonly projection: RouteValueProjection<AtlasRouteUnion>;
};

export type HubRouteManifest = {
  readonly key: `route:${string}`;
  readonly route: HubConsoleRouteUnion;
  readonly value: AtlasCatalogLookup<HubConsoleRouteUnion>;
};

export type HubRouteResolver = {
  readonly manifests: readonly HubRouteManifest[];
  readonly lookup: Record<HubConsoleRouteUnion, AtlasCatalogLookup<HubConsoleRouteUnion>>;
  readonly signatures: { [K in AtlasRouteUnion]: `signature-${string & K}` };
  readonly templates: HubConsoleTemplateUnion[];
};

export const buildHubManifest = (): HubRouteResolver => {
  const manifests: HubRouteManifest[] = Object.entries(atlasCatalogLookup).map(([route, value]) => ({
    key: `route:${route}`,
    route: route as HubConsoleRouteUnion,
    value: value as AtlasCatalogLookup<HubConsoleRouteUnion>,
  }));

  const lookup = Object.fromEntries(
    manifests.map((entry) => [entry.route, entry.value]),
  ) as Record<HubConsoleRouteUnion, AtlasCatalogLookup<HubConsoleRouteUnion>>;

  const signatures = Object.fromEntries(
    manifests.map((entry) => [entry.route, `signature-${entry.route}`]),
  ) as {
    [K in AtlasRouteUnion]: `signature-${string & K}`;
  };

  return {
    manifests,
    lookup,
    signatures,
    templates: manifestsToTemplates(manifests),
  };
};

const manifestsToTemplates = (manifests: readonly HubRouteManifest[]) =>
  manifests.map((entry) => entry.route) as HubConsoleTemplateUnion[];

export const hubConsoleManifest = buildHubManifest();

export const mapHubRouteCatalog = (routeCatalog: Record<string, string>) => {
  return Object.entries(routeCatalog).map(([index, value]) => ({
    index,
    value: String(value),
  }));
};

export const routeBundleSummary = (routes: AtlasChainResult) => {
  const routeEntries = Object.entries(routes) as [string, number][];
  return {
    count: routeEntries.length,
    keys: routeEntries.map(([route]) => route),
    values: routeEntries.map(([, value]) => value),
  };
};
