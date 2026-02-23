import type {
  RecoverySimulationLabResult,
  SimulationBandSignal,
  SimulationDependency,
  SimulationLabBlueprint,
  SimulationPlanDraft,
  SimulationPlanProjection,
  SimulationOutcomeEstimate,
} from './types';
import { buildTopology } from './topology';
import { normalizeActors, validateDraft, validateDependencyCoverage, estimateExecutionBand } from './constraints';

export interface DraftPlanInput {
  readonly blueprint: SimulationLabBlueprint;
  readonly draft: SimulationPlanDraft;
}

export interface PlanBuildOptions {
  readonly enforceCapacity: boolean;
  readonly includeWarnings: boolean;
}

const scoreBandSignals = (nodes: readonly string[], base: number): readonly SimulationBandSignal[] =>
  nodes.map((nodeId, index) => ({
    stepId: nodeId,
    score: Math.min(1, Math.max(0, base + index * 0.05)),
    band: base > 0.8 ? 'critical' : base > 0.5 ? 'elevated' : 'steady',
    rationale: `signal for node ${nodeId} adjusted by index ${index}`,
  }));

const buildEstimate = (projection: SimulationPlanProjection, bands: readonly SimulationBandSignal[]): SimulationOutcomeEstimate => ({
  planId: projection.draftId,
  confidence: Math.min(0.98, Math.max(0.2, 1 - bands.length * 0.06 + Math.min(0.35, projection.projectedStepCount * 0.01))),
  bandSignals: bands,
  expectedRecoveryMinutes: projection.projectedStepCount,
  residualRisk: bands.reduce((sum, band) => sum + band.score, 0) / Math.max(1, bands.length),
  recommendation: 'Review critical dependencies before live execution.',
});

const buildProjection = (blueprintId: string, draft: SimulationPlanDraft, nodeCount: number): SimulationPlanProjection => {
  const start = new Date(draft.window.start).toISOString();
  const totalMinutes = Math.max(1, Math.round(draft.budgetMinutes + nodeCount * 2 + draft.window.bufferMinutes));
  const end = new Date(new Date(start).getTime() + totalMinutes * 60_000).toISOString();

  return {
    draftId: `${blueprintId}:${draft.requestedBy}`,
    projectedStartAt: start,
    projectedEndAt: end,
    projectedStepCount: Math.max(1, nodeCount),
    projectedCriticalPathMs: totalMinutes * 60_000,
    band: estimateExecutionBand(draft, []),
  };
};

const buildLedger = (blueprint: SimulationLabBlueprint, draft: SimulationPlanDraft, bands: readonly SimulationBandSignal[]) => ({
  planId: `${blueprint.id}:${draft.requestedBy}`,
  events: [
    `blueprint=${blueprint.id}`,
    `requester=${draft.requestedBy}`,
    `budget=${draft.budgetMinutes}`,
  ],
  commandHistory: blueprint.nodes.map((node) => `prepare:${node.id}`),
  warnings: bands.length > 2 ? [`activeBands=${bands.length}`] : [],
  bandSignals: bands,
});

export const buildSimulationPlan = (input: DraftPlanInput, options: PlanBuildOptions): RecoverySimulationLabResult => {
  const actors = normalizeActors(input.blueprint.actorAvailability);
  const violations = [...validateDraft(input.draft, actors), ...validateDependencyCoverage(input.blueprint.dependencies, actors.map((actor) => actor.actorId))];

  const dependencyIds: readonly string[] = input.blueprint.dependencies.flatMap((dependency) => [
    dependency.dependencyId,
    ...dependency.requiredDependencyIds,
  ]);

  const topology = buildTopology(input.blueprint);
  const nodes = topology.orderedByDependencies.length === 0 ? input.blueprint.nodes.map((node) => node.id) : topology.orderedByDependencies;

  const projection = buildProjection(input.blueprint.id, input.draft, nodes.length);
  const bands = scoreBandSignals(nodes, 0.35 + (options.enforceCapacity ? 0.2 : 0));
  const estimate = buildEstimate(projection, bands);

  const dependencyWarnings = dependencyIds.slice(0, Math.min(1, dependencyIds.length));
  const ledger = buildLedger(input.blueprint, input.draft, bands);
  const allWarnings = options.includeWarnings
    ? [...ledger.warnings, ...violations.map((violation) => `${violation.code}:${violation.message}`), ...dependencyWarnings]
    : ledger.warnings;

  return {
    estimate,
    projection,
    ledger: {
      ...ledger,
      warnings: allWarnings,
    },
  };
};
