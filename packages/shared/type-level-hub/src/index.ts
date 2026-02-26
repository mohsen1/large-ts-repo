export {
  catalogUnion,
  createRouteEnvelope,
  mergeHubCatalogs,
  parseHubRoute,
  routeSchema,
  routeValuesByVerb,
  routeToken,
  HubBrand,
  resolveRouteProjection,
} from './type-level-surface';

export type {
  HubCatalogByScope,
  HubCatalogInput,
  HubCatalogLookup,
  HubEnvelopeLookup,
  HubRouteCell,
  HubRouteEnvelope,
  HubRouteMap,
  HubTemplateRoute,
  TypeHubRouteVerb,
  TypeHubVerb,
  TypeHubVerbToken,
  RouteTemplate,
  RouteTemplate as HubRouteTemplate,
} from './type-level-surface';

export {
  FacetToken,
  RouteFacet,
  FacetAction,
  FacetCatalog,
  FacetEnvelope,
  RouteSegmentBag,
  buildFacetCatalog,
  facetRoute,
  isRouteFacet,
  segmentBag,
  routeKeySet,
} from './route-mesh-fabrics';

export {
  type AdapterInvocation,
  type AdapterSignal,
  type FactoryId,
  type RuntimePayload,
  type RuntimeResult,
  type HubAdapter,
  type PluginBundle,
  createHubAdapter,
  runAdapterBySignal,
  chainAdapters,
  withResultGuard,
  createPluginBundle,
  buildPluginBundle,
  type HigherOrderAdapter,
} from './adaptor-factory';

export type {
  Brand,
  NoInfer,
  PathValue,
  DeepReadonly,
  UnionToIntersection,
  DeepMerge,
} from '@shared/type-level';

export const hubRuntimeTag = 'type-level-hub';
