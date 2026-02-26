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
  HubRouteMap,
  HubTemplateRoute,
  TypeHubRouteVerb,
  TypeHubVerb,
  TypeHubVerbToken,
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

export {
  createHubLayerUnion,
  createHubEnvelope,
  normalizeHubSeed,
  type HubLayerSeed,
  type HubEnvelope,
  type HubProjection,
  type HubPayloadTuple,
  type HubLayerUnion,
  type HubMode,
  type HubStatus,
  type HubNode,
} from './stress-hub-synthesis-lattice';

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
  ResolveDispatch as GalaxyResolveDispatch,
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
  RouteParts as ControlRouteParts,
  RouteEnvelope as ControlRouteEnvelope,
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
  StageState as StageAccumulatorState,
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
export type {
  BuildTuple as RecursiveTuple,
  Decrement as RecursiveDecrement,
} from '@shared/type-level/stress-recursive-fabric-core';
export type { RouteTokens, RouteResolution, DistilledCatalog, CascadeRoute } from '@shared/type-level/stress-template-route-cascade';
export { evaluateFlowGraph } from '@shared/type-level/stress-controlflow-branch-arena';
export type { BranchResult } from '@shared/type-level/stress-controlflow-branch-arena';
export type { BuildArithmeticChain, BinaryExpression, StringTemplateChain, ParseEventCode } from '@shared/type-level/stress-binary-expression-knot';
export type {
  SolverFactory as MatrixSolverFactory,
  createSolverInvocationMatrix,
  SolverBrand,
  BrandedSolverResult,
  SolverResult as InstantiationMatrixSolverResult,
} from '@shared/type-level/stress-generic-instantiation-matrix';
export type {
  RouteEnvelope,
  RouteParts,
  OrbitRoute,
  OrbitDomain,
  OrbitScope,
  OrbitAction,
} from '@shared/type-level/stress-conditional-orbit';
export type {
  DistinctShardBundle,
  BundleByKind,
  OrbitBundle,
  BundleProfile,
  ShardUnion,
} from '@shared/type-level/stress-disjoint-intersections';
export type {
  BuildTuple as CascadeBuildTuple,
  Decrement as CascadeDecrement,
  DeepRecursive,
  RouteStateTuple,
} from '@shared/type-level/stress-recursive-cascade';
export type {
  EvaluateNumeric,
  ExpressionCatalog,
  RouteExpression,
  ExpressionRoute,
  PathToLabel,
} from '@shared/type-level/stress-binary-expression-lane';
export type {
  SolverContract,
  SolverFactory as HubInstantiationSolverFactory,
  SolverResult as InstantiationSolverResult,
  SolverRegistry as HubSolverRegistry,
  createSolverFactory,
  composeSolverPipeline,
} from '@shared/type-level/stress-instantiation-hub';
export * as stressConditionalOrbit from '@shared/type-level/stress-conditional-orbit';
export * as stressSubtypeDepth from '@shared/type-level/stress-subtype-depth';
export * as stressDisjointIntersections from '@shared/type-level/stress-disjoint-intersections';
export * as stressTemplateRemap from '@shared/type-level/stress-template-remap';
export * as stressRecursiveCascade from '@shared/type-level/stress-recursive-cascade';
export * as stressConditionalConvergence from '@shared/type-level/stress-conditional-convergence';
export * as stressSubtypeChainCascade from '@shared/type-level/stress-subtype-chain-cascade';
export * as stressOrionHubLattice from './stress-orion-hub-lattice';
export type {
  HubResolver,
  HubResolution,
  HubCatalogByCommand,
  HubSolver,
  HubDecision,
  HubNodeEnvelope,
  HubRouteEnvelope,
} from './stress-orion-hub-lattice';
export * as stressMappedRouteMatrices from '@shared/type-level/stress-mapped-route-matrices';
export * as stressRecursiveMutualLattice from '@shared/type-level/stress-recursive-mutual-lattice';
export * as stressTemplateRouteConstellations from '@shared/type-level/stress-template-route-constellations';
export * as stressControlflowBranchArenaExtended from '@shared/type-level/stress-controlflow-branch-arena-extended';
export * as stressBinaryLiteralArithmetic from '@shared/type-level/stress-binary-literal-arithmetic';
export * as stressGenericInstantiationArsenal from '@shared/type-level/stress-generic-instantiation-arsenal';
export * as stressSolverConflictSimulator from '@shared/type-level/stress-solver-conflict-simulator';
export * as stressBinaryExpressionLane from '@shared/type-level/stress-binary-expression-lane';
export * as stressInstantiationHub from '@shared/type-level/stress-instantiation-hub';
export * as stressConditionalFusionMatrix from '@shared/type-level/stress-conditional-fusion-matrix';
export * as stressHierarchyDepthShip from '@shared/type-level/stress-hierarchy-depth-ship';
export * as stressDisjointMappedPorts from '@shared/type-level/stress-disjoint-mapped-ports';
export * as stressTemplateRouteLabyrinth from '@shared/type-level/stress-template-route-labyrinth';
export * as stressRecursiveRuntimeLattice from '@shared/type-level/stress-recursive-runtime-lattice';
export * as stressConstraintOrchestrationGrid from '@shared/type-level/stress-constraint-orchestration-grid';
export * as stressGenericInstantiationAtlas from '@shared/type-level/stress-generic-instantiation-atlas';
export * as stressControlflowGalaxy from '@shared/type-level/stress-controlflow-galaxy';
export * as stressModernRuntimeGuards from '@shared/type-level/stress-modern-runtime-guards';
export type {
  SolverMode,
  SolverVerb,
  SolverBenchmarkEntry,
  SolverResult,
  SolverRunRecord,
} from '@shared/type-level/stress-generic-solver-orchestrator';
export { solve, runSolverBenchmark, runSolverFabric, buildSolverCatalog, profileSolverMatrix } from '@shared/type-level/stress-generic-solver-orchestrator';
export * as typeLevelHubDispatchGrid from './type-level-hub-dispatch-grid';
export * as stressHubComposition from './stress-hub-composition';
export * as typeLevelComposition from '@shared/type-level-composition';
export * from './type-level-stress-constructor';
export * as typeLevelFabric from '@shared/type-level-fabric';
export * as stressConditionalDispatchGrid from '@shared/type-level/stress-conditional-dispatch-grid';
export * as stressDeepSubtypeEscalation from '@shared/type-level/stress-deep-subtype-escalation';
export * as stressDisjointIntersectionForge from '@shared/type-level/stress-disjoint-intersection-forge';
export * as stressTemplateRemapConstellation from '@shared/type-level/stress-template-remap-constellation';
export * as stressRecursiveCascadeLattice from '@shared/type-level/stress-recursive-cascade-lattice';
export * as stressTemplateRouteMatrix from '@shared/type-level/stress-template-route-matrix';
export * as stressControlflowSwitchyard from '@shared/type-level/stress-controlflow-switchyard';
export * as stressBinaryExpressionGalaxy from '@shared/type-level/stress-binary-expression-galaxy';
export * as stressGenericInstantiationAtScale from '@shared/type-level/stress-generic-instantiation-at-scale';
export type {
  ResolveDispatch,
  DispatchUnion,
  DispatchResultSet,
  DispatchFeed,
  DispatchChain,
  DispatchCatalog,
} from '@shared/type-level/stress-conditional-dispatch-grid';
export type {
  CarrierLayer20,
  DeepCarrierDepth,
  DeepSubtypeMatrix,
  DepthCarrier40,
} from '@shared/type-level/stress-deep-subtype-escalation';
export type {
  DispatchMapProfile,
  ComposeDisjoint,
  IntersectedPayload,
  MapByPolicy,
} from '@shared/type-level/stress-disjoint-intersection-forge';
export type {
  TemplateMatrix,
  TemplateProjection,
  TemplateMap,
  RouteTemplateCatalog,
} from '@shared/type-level/stress-template-remap-constellation';
export type {
  RouteEntity,
  RouteToken,
  RouteCatalogItem,
  RouteUnion,
  ParsedRoute,
  RouteProjection,
  RouteSignatureMatrix,
  RouteMapByEntity,
  RouteAction,
  RouteVerb,
  RoutedTuples,
  RouteToken as LegacyRouteToken,
} from '@shared/type-level/stress-template-route-matrix';
export type {
  StageEvent,
  StageState,
  StageRouter,
  FlowBranch,
  BranchEnvelope,
  StageResultByKind,
} from '@shared/type-level/stress-controlflow-switchyard';
export type {
  BinaryExprResult,
  ChainTemplate,
  EvaluateBinary,
  ParsedBooleanExpressionSet,
  EvaluatedExpressionSet,
  BuildBoolTuple,
  boolTuple,
} from '@shared/type-level/stress-binary-expression-galaxy';
export type {
  SolverFactory,
  SolverRegistry,
  SolverConstraint,
  SolverAdapter,
  ConstraintUnion,
  SolverSelection,
  BrandedId,
  BrandedTag,
} from '@shared/type-level/stress-generic-instantiation-at-scale';

export * as stressOrionCompositeControlflow from '@shared/type-level/stress-orion-composite-controlflow';
export * as stressOrionGenericInstantiationOrbit from '@shared/type-level/stress-orion-generic-instantiation-orbit';
export * as stressOrionTemplateFabric from '@shared/type-level/stress-orion-template-fabric';
export * as stressOrionDeepRecursionGrid from '@shared/type-level/stress-orion-deep-recursion-grid';
export * as stressOrionConstraintBraid from '@shared/type-level/stress-orion-constraint-braid';
export * as stressOrionRuntimeRegistry from '@shared/type-level/stress-orion-runtime-registry';
export * as stressHubSynthesisLattice from './stress-hub-synthesis-lattice';
export * as stressHubOrionOrchestrator from './stress-hub-orion-orchestrator';
export {
  type HubOrionDomain,
  type HubOrionVerb,
  type HubOrionPolicy,
  type HubOrionEnvelope,
  type HubOrionDiscriminant,
  type HubOrionResolve,
  type HubOrionDispatch,
  type HubOrionTuple,
  type HubOrionUnion,
  type HubOrionResolutionSet,
  type HubOrionTemplate,
  hubOrionSeed,
  hubOrionRegistry,
} from './stress-hub-orion-orchestrator';
export * as stressOrbitalConditionalLattice from '@shared/type-level/stress-orbital-conditional-lattice';
export * as stressHyperChain from '@shared/type-level/stress-hyper-chain';
export * as stressDisjointBridge from '@shared/type-level/stress-disjoint-bridge';
export * as stressTemplateKeyLattice from '@shared/type-level/stress-template-key-lattice';
export * as stressRecursiveTupleFabrik from '@shared/type-level/stress-recursive-tuple-fabrik';
export * as stressTemplateRouteGrammar from '@shared/type-level/stress-template-route-grammar';
export * as stressBranchSagaControl from '@shared/type-level/stress-branch-saga-control';
export * as stressBinaryExpressionSigil from '@shared/type-level/stress-binary-expression-sigil';
export * as stressGenericInstantiatorMatrix from '@shared/type-level/stress-generic-instantiator-matrix';
export * as stressSolverConstraintsWeb from '@shared/type-level/stress-solver-constraints-web';
