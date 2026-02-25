export type { CascadePolicyTemplate, PolicyRuntimeConfig } from '@domain/recovery-cascade-intelligence';

export * from './types.js';

export {
  buildPlan,
  buildSummaryFromPlan,
  mergePlan,
  planFromBlueprint,
  planTopologyLayers,
  summarizeBlueprint,
  summarizePlan,
  validatePlan,
} from './planner.js';
export {
  buildBlueprintSnapshot,
  summarizeBlueprint as summarizePlanBlueprint,
  toBlueprintSnapshot,
} from './planner.js';

export {
  buildTopologyIndex,
  collectTelemetry,
  computeDependencies,
  makeTopologyTelemetry,
  normalizeStageWeights,
  runTelemetryPipeline,
  telemetryCount,
  telemetryReady,
  telemetryToSeries,
  topologyBaseline,
  toTelemetryRecord,
} from './telemetry.js';
export {
  executeCascadeIntelligence,
  type CascadeIntelligenceOrchestrator,
} from './executor.js';
export { buildSummaryFromPlan as runSummaryFromPlan } from './planner.js';

export {
  runCampaignFromRun,
  runCampaignWithScope,
  buildCampaignEnvelope,
  buildExperimentMatrix,
  buildExperimentResult,
  buildExperimentVariants,
  mapCampaignOutcomes,
  runExperimentCampaign,
  summarizeExperimentRun,
  type ExperimentRunOutput,
  type ExperimentRunInput,
} from './experiments.js';
export {
  buildEngineRegistry,
  executeWorkflow,
  hydrateRegistry,
  planWorkflow,
  type WorkflowEngineState,
  type WorkflowPlanResult,
} from './workflow-engine.js';
export {
  applyBlueprintAdapters,
  buildAdapterRegistry,
  bootstrapAdapters,
  buildAdapterLog,
  mapByKind,
  mapStageAdapters,
  normalizeAdapters,
  createAdapterRegistry,
  listStageAdapters,
  stageToTag,
} from './adapters.js';
export {
  buildRunInsights,
  classifyRun,
  dedupeByMessage,
  summarizeByTag,
  scoreByCatalog,
  type RuntimeInsight,
} from './insights.js';
