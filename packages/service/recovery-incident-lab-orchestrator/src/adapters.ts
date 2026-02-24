import type { IncidentLabEnvelope, IncidentLabPlan, IncidentLabScenario, LabRuntimeVector } from '@domain/recovery-incident-lab-core';
import { createPlanId } from '@domain/recovery-incident-lab-core';

export const toPlanDigest = (plan: IncidentLabPlan): string =>
  `${plan.id}:${plan.queue.join('>')}:${plan.state}:${plan.scheduledBy}`;

export const toScenarioDigest = (scenario: IncidentLabScenario): string =>
  `${scenario.id}:${scenario.labId}:${scenario.topologyTags.length}:${scenario.steps.length}`;

export const envelopeToVector = (envelope: IncidentLabEnvelope<LabRuntimeVector>): LabRuntimeVector => {
  if (typeof envelope.payload === 'object' && envelope.payload && 'throughput' in envelope.payload) {
    return envelope.payload as LabRuntimeVector;
  }
  return { throughput: 0, latencyMs: 0, integrityScore: 0 };
};

export const withPlanTrace = (input: string): IncidentLabPlan['id'] => createPlanId(input as unknown as IncidentLabPlan['scenarioId']);
