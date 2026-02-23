import type { SimulationLabBlueprint, SimulationPlanDraft } from './types';

export const defaultLabBlueprint = (id: string): SimulationLabBlueprint => ({
  id,
  name: 'recovery-simulation-lab',
  mode: 'rehearsal',
  ownerTeam: 'simulation-platform',
  lifecycle: 'ready',
  nodes: [
    {
      id: 'api-gateway',
      name: 'api-gateway',
      serviceArea: 'edge',
      region: 'us-east-1',
      criticality: 5,
    },
    {
      id: 'db-primary',
      name: 'primary-database',
      serviceArea: 'data',
      region: 'us-east-1',
      criticality: 5,
    },
    {
      id: 'idp',
      name: 'identity-provider',
      serviceArea: 'control',
      region: 'us-east-2',
      criticality: 4,
    },
  ],
  edges: [
    {
      fromNodeId: 'api-gateway',
      toNodeId: 'db-primary',
      lagMs: 720,
      confidence: 0.91,
    },
    {
      fromNodeId: 'api-gateway',
      toNodeId: 'idp',
      lagMs: 450,
      confidence: 0.85,
    },
  ],
  dependencies: [
    {
      dependencyId: 'primary-flow',
      requiredDependencyIds: ['api-gateway', 'db-primary'],
      criticalityWeight: 0.7,
    },
    {
      dependencyId: 'control-flow',
      requiredDependencyIds: ['idp'],
      criticalityWeight: 0.35,
    },
  ],
  actorAvailability: [
    {
      actorId: 'actor-core',
      timezone: 'UTC',
      shiftStart: '06:00',
      shiftEnd: '18:00',
      maxConcurrentSteps: 3,
      fatigueIndex: 0.2,
    },
    {
      actorId: 'actor-edge',
      timezone: 'UTC',
      shiftStart: '08:00',
      shiftEnd: '20:00',
      maxConcurrentSteps: 2,
      fatigueIndex: 0.35,
    },
  ],
});

export const defaultLabDraft = (blueprintId: string): SimulationPlanDraft => ({
  blueprintId,
  requestedBy: 'recovery-console',
  window: {
    start: new Date().toISOString(),
    end: new Date(Date.now() + 30 * 60_000).toISOString(),
    bufferMinutes: 12,
    timezone: 'UTC',
  },
  allowParallelism: true,
  minActorsPerBatch: 2,
  maxParallelSteps: 4,
  budgetMinutes: 30,
});
