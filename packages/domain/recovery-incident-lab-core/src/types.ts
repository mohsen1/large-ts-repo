import type { Brand, Edge as CoreEdge } from '@shared/core';

export const lifecycleStates = ['draft', 'ready', 'active', 'cooldown', 'completed', 'aborted'] as const;
export type LifecycleState = (typeof lifecycleStates)[number];

export const severityBands = ['low', 'medium', 'high', 'critical', 'critical+'] as const;
export type SeverityBand = (typeof severityBands)[number];

export const signalKinds = ['capacity', 'latency', 'integrity', 'dependency'] as const;
export type SignalKind = (typeof signalKinds)[number];

export type IncidentLabId = Brand<string, 'IncidentLabId'>;
export type ScenarioId = Brand<string, 'ScenarioId'>;
export type StepId = Brand<string, 'StepId'>;
export type RunId = Brand<string, 'RunId'>;
export type EnvelopeId = Brand<string, 'EnvelopeId'>;

export interface LabActor {
  readonly id: Brand<string, 'ActorId'>;
  readonly name: string;
  readonly role: string;
  readonly team: string;
}

export interface StepConstraint {
  readonly key: string;
  readonly operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';
  readonly value: number;
}

export interface LabTemplateStep {
  readonly id: StepId;
  readonly label: string;
  readonly command: string;
  readonly expectedDurationMinutes: number;
  readonly dependencies: readonly StepId[];
  readonly constraints: readonly StepConstraint[];
  readonly owner: Brand<string, 'ActorId'>;
}

export interface LabStepResult {
  readonly stepId: StepId;
  readonly startAt: string;
  readonly finishAt: string;
  readonly status: 'done' | 'skipped' | 'failed';
  readonly logs: readonly string[];
  readonly sideEffects: readonly string[];
}

export interface IncidentLabScenario {
  readonly id: ScenarioId;
  readonly labId: IncidentLabId;
  readonly name: string;
  readonly createdBy: string;
  readonly severity: SeverityBand;
  readonly topologyTags: readonly string[];
  readonly steps: readonly LabTemplateStep[];
  readonly estimatedRecoveryMinutes: number;
  readonly owner: string;
  readonly labels: readonly string[];
}

export interface IncidentLabSignal {
  readonly kind: SignalKind;
  readonly node: string;
  readonly value: number;
  readonly at: string;
}

export interface IncidentLabEnvelope<TPayload = unknown> {
  readonly id: EnvelopeId;
  readonly labId: IncidentLabId;
  readonly scenarioId: ScenarioId;
  readonly payload: TPayload;
  readonly createdAt: string;
  readonly origin: string;
}

export interface IncidentLabPlan {
  readonly id: Brand<string, 'PlanId'>;
  readonly scenarioId: ScenarioId;
  readonly labId: IncidentLabId;
  readonly selected: readonly StepId[];
  readonly queue: readonly StepId[];
  readonly state: LifecycleState;
  readonly orderedAt: string;
  readonly scheduledBy: string;
}

export interface IncidentLabRun {
  readonly runId: RunId;
  readonly planId: string;
  readonly scenarioId: ScenarioId;
  readonly startedAt: string;
  readonly completeBy?: string;
  readonly state: LifecycleState;
  readonly results: readonly LabStepResult[];
}

export interface IncidentLabCommand {
  readonly id: Brand<string, 'CommandId'>;
  readonly action: 'inject' | 'drain' | 'restore' | 'verify';
  readonly stepId: StepId;
  readonly reason: string;
  readonly createdAt: string;
}

export interface LabRuntimeVector {
  readonly throughput: number;
  readonly latencyMs: number;
  readonly integrityScore: number;
}

export type LabRuntimeShape<TConfig> = { readonly config: TConfig } & Pick<IncidentLabRun, 'runId' | 'state'>;

export type LabNodeLink<T extends string = string> = Omit<CoreEdge, "from" | "to"> & {
  readonly from: T;
  readonly to: T;
  readonly weight: number;
  readonly criticality: number;
};

export interface LabGraph {
  readonly nodes: readonly StepId[];
  readonly links: readonly LabNodeLink<StepId>[];
}

export interface LabPolicyGate {
  readonly id: Brand<string, 'GateId'>;
  readonly label: string;
  readonly predicate: string;
  readonly enabled: boolean;
}

export type RunEvent = { id: Brand<string, 'run-event'>; name: string; output: IncidentLabSignal };
export type LabEventSink<T> = (event: T) => void;
export type LabEventBus<T> = { publish(event: T): void; subscribe(handler: LabEventSink<T>): () => void };

export type LabDependencyMap = Record<string, readonly StepId[]>;

export type LabSelector<T> = {
  readonly label: string;
  readonly includeArchived?: boolean;
  readonly test: (value: T) => boolean;
};

export type LabGraphStats = {
  readonly totalNodes: number;
  readonly linkedNodes: number;
  readonly disconnectedNodes: number;
  readonly avgCriticality: number;
};

export interface RuntimeClock {
  readonly now: () => string;
  readonly deltaMillis: (fromIso: string) => number;
}

export const createClock = (base: () => Date = () => new Date()): RuntimeClock => ({
  now: () => base().toISOString(),
  deltaMillis: (fromIso: string) => base().getTime() - new Date(fromIso).getTime(),
});

export const createLabId = (raw: string): IncidentLabId => String(raw).trim() as IncidentLabId;
export const createScenarioId = (raw: string): ScenarioId => String(raw).trim() as ScenarioId;
export const createStepId = (scenarioId: ScenarioId, index: number): StepId => `${String(scenarioId)}:step-${index}` as StepId;
export const createPlanId = (scenarioId: ScenarioId): IncidentLabPlan['id'] => `${String(scenarioId)}:plan-${Date.now()}` as IncidentLabPlan['id'];
export const buildGateKey = (index: number, gateName: string): Brand<string, 'GateId'> => `${gateName}:${index}` as Brand<string, 'GateId'>;

export const estimatePlanId = (input: string): IncidentLabPlan['id'] => `${input}:plan` as IncidentLabPlan['id'];
export const normalizeSteps = (steps: readonly LabTemplateStep[]): readonly LabTemplateStep[] =>
  steps.length > 0
    ? steps
    : [
        {
          id: 'fallback:noop' as StepId,
          label: 'noop',
          command: 'noop',
          expectedDurationMinutes: 1,
          dependencies: [],
          constraints: [],
          owner: 'system' as Brand<string, 'ActorId'>,
        },
      ];

export const buildGraphTemplate = (steps: readonly LabTemplateStep[]): { readonly nodes: readonly StepId[]; readonly edges: readonly { readonly from: StepId; readonly to: StepId; readonly weight: number }[] } => ({
  nodes: steps.map((step) => step.id),
  edges: steps.flatMap((step) =>
    step.dependencies.map((dependency) => ({
      from: dependency,
      to: step.id,
      weight: 1,
    })),
  ),
});

