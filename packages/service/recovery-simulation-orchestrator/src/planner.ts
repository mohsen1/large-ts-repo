import { buildManifest, materializeExecutionEntries, seedRunRecord, type SimulationManifestPlan } from '@domain/recovery-simulation-core';
import type { SimulationScenarioBlueprint, SimulationRunRecord } from '@domain/recovery-simulation-core';
import { toRunEnvelope } from '@domain/recovery-simulation-core/src/adapters';

export interface PlanWithRun {
  readonly manifest: SimulationManifestPlan;
  readonly seededRun: SimulationRunRecord;
}

export const preparePlan = (
  scenario: SimulationScenarioBlueprint,
  requestedBy: string,
): PlanWithRun => {
  const manifest = buildManifest(scenario, requestedBy);
  const seededRun = seedRunRecord(manifest.manifest);
  return { manifest, seededRun };
};

export const planSnapshot = (plan: SimulationManifestPlan): string =>
  `${plan.manifest.id}:${plan.commandCount}:${manifestCriticality(plan)}:${toRunEnvelope(seedRunRecord(plan.manifest)).envelope.id}`;

const manifestCriticality = (plan: SimulationManifestPlan): number => Math.min(5, plan.commandCount);

export const appendExecutionSteps = (plan: PlanWithRun): ReadonlyArray<SimulationRunRecord['executedSteps'][number]> =>
  materializeExecutionEntries(plan.manifest.manifest);
