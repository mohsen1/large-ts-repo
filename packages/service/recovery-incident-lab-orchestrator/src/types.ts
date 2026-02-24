import type {
  IncidentLabScenario,
  IncidentLabPlan,
  IncidentLabRun,
  IncidentLabSignal,
  LabRuntimeShape,
  IncidentLabEnvelope,
} from '@domain/recovery-incident-lab-core';

export type OrchestratorMode = 'manual' | 'auto' | 'stress';

export interface OrchestrationConfig {
  readonly mode: OrchestratorMode;
  readonly targetThroughput: number;
  readonly jitterPercent: number;
  readonly maxParallelism: number;
}

export interface OrchestratorInput {
  readonly scenario: IncidentLabScenario;
  readonly plan: IncidentLabPlan;
  readonly config: OrchestratorConfig;
}

export interface OrchestratorOutput {
  readonly plan: IncidentLabPlan;
  readonly run: IncidentLabRun;
  readonly telemetry: readonly IncidentLabEnvelope<unknown>[];
}

export interface OrchestratorConfig {
  readonly batchSize: number;
  readonly sampleIntervalMs: number;
  readonly seed: number;
  readonly dryRun: boolean;
  readonly targetThroughput: number;
  readonly jitterPercent: number;
}

export type OrchestrationState = 'idle' | 'prepared' | 'running' | 'stopped' | 'errored';

export interface OrchestratorStatus {
  readonly state: OrchestrationState;
  readonly startedAt: string;
  readonly stoppedAt?: string;
  readonly executed: number;
}

export interface OrchestratorDependencies {
  readonly onEvent: (envelope: IncidentLabEnvelope) => Promise<void>;
  readonly shouldContinue: () => boolean;
}

export interface ExecutionWindow<TMeta = Record<string, unknown>> {
  readonly clock: () => string;
  readonly shape: LabRuntimeShape<TMeta>;
}

export type SignalReducer = (acc: number, signal: IncidentLabSignal) => number;

export interface ControlPlane {
  readonly applySignal: (signal: IncidentLabSignal) => IncidentLabSignal;
  readonly emitTelemetry: (payload: IncidentLabEnvelope) => void;
}
