import { type FabricSimulationResult, type FabricPlan } from '@domain/recovery-ops-fabric';

export interface FabricEnvelope {
  readonly entityType: 'plan' | 'simulation';
  readonly payload: string;
  readonly serializedAt: string;
}

export const encodePlan = (plan: FabricPlan): FabricEnvelope => ({
  entityType: 'plan',
  payload: JSON.stringify(plan),
  serializedAt: new Date().toISOString(),
});

export const encodeSimulation = (simulation: FabricSimulationResult): FabricEnvelope => ({
  entityType: 'simulation',
  payload: JSON.stringify(simulation),
  serializedAt: new Date().toISOString(),
});

export const decodePlan = (envelope: FabricEnvelope): FabricPlan | null => {
  if (envelope.entityType !== 'plan') {
    return null;
  }
  const parsed = JSON.parse(envelope.payload) as FabricPlan;
  return parsed;
};

export const decodeSimulation = (envelope: FabricEnvelope): FabricSimulationResult | null => {
  if (envelope.entityType !== 'simulation') {
    return null;
  }
  const parsed = JSON.parse(envelope.payload) as FabricSimulationResult;
  return parsed;
};
