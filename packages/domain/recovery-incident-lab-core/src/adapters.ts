import type {
  IncidentLabScenario,
  IncidentLabPlan,
  IncidentLabRun,
  IncidentLabSignal,
  IncidentLabEnvelope,
  StepId
} from './types';
import { createLabId, createScenarioId, createPlanId } from './types';

export interface ScenarioWire {
  readonly id: string;
  readonly labId: string;
  readonly name: string;
  readonly createdBy: string;
  readonly severity: string;
  readonly topologyTags: readonly string[];
  readonly steps: readonly {
    readonly id: string;
    readonly label: string;
    readonly command: string;
    readonly expectedDurationMinutes: number;
    readonly dependencies: readonly string[];
    readonly owner: string;
  }[];
}

export interface PlanWire {
  readonly planId: string;
  readonly scenarioId: string;
  readonly labId: string;
  readonly scheduledBy: string;
  readonly queue: readonly string[];
}

export interface EnvelopeWire<TPayload> {
  readonly id: string;
  readonly labId: string;
  readonly scenarioId: string;
  readonly payload: TPayload;
}

export const toScenario = (wire: ScenarioWire): IncidentLabScenario => ({
  id: createScenarioId(wire.id),
  labId: createLabId(wire.labId),
  name: wire.name,
  createdBy: wire.createdBy,
  severity: wire.severity as IncidentLabScenario['severity'],
  topologyTags: wire.topologyTags,
  steps: wire.steps.map((step) => ({
    id: step.id as StepId,
    label: step.label,
    command: step.command,
    expectedDurationMinutes: step.expectedDurationMinutes,
    dependencies: step.dependencies as readonly StepId[],
    constraints: [],
    owner: step.owner as IncidentLabScenario['steps'][number]['owner'],
  })),
  estimatedRecoveryMinutes: wire.steps.reduce((acc, step) => acc + step.expectedDurationMinutes, 0),
  owner: wire.createdBy,
  labels: ['imported', 'wire'],
});

export const toPlan = (scenario: IncidentLabScenario, wire: PlanWire): IncidentLabPlan => ({
  id: createPlanId(scenario.id),
  scenarioId: scenario.id,
  labId: createLabId(wire.labId),
  selected: [...wire.queue] as unknown as readonly StepId[],
  queue: [...wire.queue] as unknown as readonly StepId[],
  state: 'ready',
  orderedAt: new Date().toISOString(),
  scheduledBy: wire.scheduledBy,
});

export const toRunEnvelope = <T>(wire: EnvelopeWire<T>): IncidentLabEnvelope<T> => ({
  id: wire.id as IncidentLabEnvelope<T>['id'],
  labId: createLabId(wire.labId),
  scenarioId: createScenarioId(wire.scenarioId),
  payload: wire.payload,
  createdAt: new Date().toISOString(),
  origin: 'wire',
});

export const normalizeSignal = (raw: string): IncidentLabSignal => {
  const parts = raw.split(':');
  const kind = (parts[0] as IncidentLabSignal['kind']) || 'capacity';
  return {
    kind,
    node: parts[1] ?? 'unknown',
    value: Number(parts[2] ?? 0),
    at: new Date().toISOString(),
  };
};

export const runToWire = (run: IncidentLabRun): string => JSON.stringify(run);
