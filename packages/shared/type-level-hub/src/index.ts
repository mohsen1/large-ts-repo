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
  type AtlasSession,
  type AtlasEnvelope,
  type AtlasChain,
  type AtlasRoute,
  type AtlasRegistryInput,
  toAtlasRoute,
  atlasManifest,
  parseAtlasRoute,
  buildAtlasIndex,
  runAtlasPipeline,
  createAtlasState,
  routeFromParts,
  bundleAtlas,
  dispatchAtlasPayload,
} from './type-level-stress-atlas';

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

export type {
  BranchAction,
  BranchEvent,
  BranchEventCatalog,
  BranchEventTuple,
  BranchLedger,
  BranchOutcome,
  BranchPlan,
  BranchSeed,
  BranchSequence,
  BranchState,
} from '@shared/type-level/stress-large-controlflow-branches';
export type { Branded } from '@shared/type-level/stress-solver-conflict-hub';
export type {
  ChainThen,
  DeepRouteChain,
  GalaxyCatalog,
  GalaxyDispatch,
  GalaxyRoute,
  ResolveDispatch,
  RouteCatalog,
  RouteCatalogEntries,
  RouteMap,
  RouteByPhase,
} from '@shared/type-level/stress-conditional-dispatch-galaxy';
export type {
  ControlCatalogByVerb,
  ControlCatalogEntries,
  ControlDomain,
  ControlRemapped,
  ControlResolutionGraph,
  ControlRoute,
  ControlSeverity,
  ControlVerb,
  ControlRouteCatalog,
  RouteParts,
  RouteEnvelope,
} from '@shared/type-level/stress-template-control-plane';
export type { IntersectedAggregate, IntersectionMap } from '@shared/type-level/stress-intersection-voltage';
export type {
  PluginId,
  PluginBrand,
  PluginConfig,
  PluginContract,
  PluginEnvelope,
  PluginRegistryEntry,
  BrandedPlugin,
  RegistryMatrix,
  RegistryRecord,
  SolverDomain,
  SolveConstraint,
} from '@shared/type-level/stress-hydra-plugin-orchestrator';
export type {
  StageAccumulator,
  StageAccumulatorFold,
  StageConstraint,
  StageDispatch,
  StageFactory,
  StageFlow,
  StageMode,
  StagePayload,
  StageResult,
  StageState,
  StageResolver,
} from '@shared/type-level/stress-overload-generic-factory';

export {
  galaxyCatalog,
  resolveDispatchMatrix,
  galaxyDispatchMatrix,
} from '@shared/type-level/stress-conditional-dispatch-galaxy';
export {
  controlRouteCatalog,
  controlCatalogEntries,
  controlGraph,
  resolveControlEnvelope,
  parseRoute,
} from '@shared/type-level/stress-template-control-plane';
export {
  stageCatalog,
  runStageChain,
  stageAccumulator,
  stageResultCatalog,
  stageSignature,
  stageMatrix,
} from '@shared/type-level/stress-overload-generic-factory';
export {
  createDomainRegistry,
  createPluginRegistry,
  pluginEnvelope,
  pluginCatalog,
} from '@shared/type-level/stress-hydra-plugin-orchestrator';
export {
  routeBranches,
  runBranchFlow,
  branchTimeline,
  branchStates,
} from '@shared/type-level/stress-large-controlflow-branches';

export type { DiscriminatedRouteResolution as StressConditionalResolution } from '@shared/type-level/stress-conditional-discriminator-lattice';
export type { DeepLayerChain, LayerTrace } from '@shared/type-level/stress-deep-hierarchy-lattice';
export type { IntersectionBundleA, IntersectionBundleB, IntersectionUnion, ComposeBlueprint } from '@shared/type-level/stress-safe-intersection-blueprint';
export type { NestedTemplateRemap, TemplateRemap, EventRouteCatalog } from '@shared/type-level/stress-mapped-template-fabric';
export type { BuildTuple, Decrement, Add, Multiply, RecursiveCatalog } from '@shared/type-level/stress-recursive-fabric-core';
export type { RouteTokens, RouteResolution, DistilledCatalog, CascadeRoute } from '@shared/type-level/stress-template-route-cascade';
export { evaluateFlowGraph } from '@shared/type-level/stress-controlflow-branch-arena';
export type { BranchResult } from '@shared/type-level/stress-controlflow-branch-arena';
export type { BuildArithmeticChain, BinaryExpression, StringTemplateChain, ParseEventCode } from '@shared/type-level/stress-binary-expression-knot';
export type { SolverFactory, SolverResult, createSolverInvocationMatrix, SolverBrand, BrandedSolverResult } from '@shared/type-level/stress-generic-instantiation-matrix';
