import { calculateResidualRisk, clonePlanSteps, makeSimulationClock, type SimulationRunRecord, type SimulationScenarioBlueprint, type SimulationStepExecution, type SimulationPlanManifest } from './types';
import { calculateTopology as buildTopology, type TopologyPlan } from './topology';
import { buildDefaultPolicy, enforcePolicyOnScenario, tuneConcurrency } from './policy';
import { normalizeTimestamp } from './types';

export interface SimulationManifestPlan {
  readonly manifest: SimulationPlanManifest;
  readonly commandCount: number;
  readonly topology: TopologyPlan;
  readonly expectedCriticalPathMs: number;
  readonly policyName: string;
}

export const buildManifest = (scenario: SimulationScenarioBlueprint, requestedBy: string): SimulationManifestPlan => {
  const policy = buildDefaultPolicy();
  const policyOutcome = enforcePolicyOnScenario(scenario, policy);

  const manifest: SimulationPlanManifest = {
    id: `${scenario.id}:manifest` as SimulationPlanManifest['id'],
    scenarioId: scenario.id,
    createdAt: normalizeTimestamp(new Date().toISOString()),
    requestedBy,
    steps: clonePlanSteps(scenario.steps),
    expectedRecoveryBudgetMs: policyOutcome.effectiveDurationMs,
    concurrencyLimit: policy.allowParallelism ? Math.max(1, Math.min(8, scenario.steps.length)) : 1,
    objective: `Restore service continuity for ${scenario.title}`,
  };

  const topology = buildTopology(scenario);
  const tuned = tuneConcurrency(manifest, policy);

  return {
    manifest: tuned,
    commandCount: scenario.steps.length,
    topology,
    expectedCriticalPathMs: expectedCriticalPathMs(scenario, topology),
    policyName: policy.name,
  };
};

const expectedCriticalPathMs = (scenario: SimulationScenarioBlueprint, topology: TopologyPlan): number => {
  if (topology.layers.length === 0) {
    return 0;
  }
  return topology.layers.reduce((total, layer) => {
    const maxInLayer = layer.steps
      .map((stepId) => scenario.steps.find((step) => step.id === stepId)?.expectedDurationMs ?? 0)
      .reduce((stepTotal, value) => Math.max(stepTotal, value), 0);
    return total + maxInLayer;
  }, 0);
};

export const materializeExecutionEntries = (manifest: SimulationPlanManifest): readonly SimulationStepExecution[] =>
  manifest.steps.map((step) => ({
    stepId: step.id,
    state: 'queued',
    metrics: [{ key: 'estimate_ms', value: step.expectedDurationMs }],
  }));

export const seedRunRecord = (manifest: SimulationPlanManifest): SimulationRunRecord => {
  const now = makeSimulationClock().now();
  return {
    id: `${manifest.id}:run` as SimulationRunRecord['id'],
    planId: manifest.id,
    scenarioId: manifest.scenarioId,
    createdAt: now,
    state: 'queued',
    startedAt: now,
    executedSteps: materializeExecutionEntries(manifest),
    incidentsDetected: 0,
    residualRiskScore: calculateResidualRisk(0, 0, manifest.steps.length),
  };
};
