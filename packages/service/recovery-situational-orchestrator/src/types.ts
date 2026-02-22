import type {
  SituationalAssessment,
  PlanningContext,
  RecoveryWorkloadNode,
  SituationalSnapshot,
  SituationalSignal,
} from '@domain/recovery-situational-intelligence';

export type OrchestratorMode = 'live' | 'simulation';

export interface OrchestrateRequest {
  readonly context: PlanningContext;
  readonly node: RecoveryWorkloadNode;
  readonly snapshot: SituationalSnapshot;
  readonly signals: readonly SituationalSignal[];
  readonly mode: OrchestratorMode;
}

export interface OrchestrateResponse {
  readonly assessment: SituationalAssessment;
  readonly mode: OrchestratorMode;
  readonly persisted: boolean;
}

export interface SituationalTelemetry {
  readonly workloadNodeId: string;
  readonly assessmentsCount: number;
  readonly activeSignals: number;
  readonly planCoverage: number;
  readonly averageConfidence: number;
}

export interface CommandCenterState {
  readonly activeAssessmentIds: readonly string[];
  readonly lastAssessmentAt?: string;
  readonly telemetry: SituationalTelemetry;
}

export interface CommandCenterSnapshot {
  readonly request: OrchestrateRequest;
  readonly mode: OrchestratorMode;
  readonly requestStartedAt: string;
}

export interface TelemetryPulse {
  readonly label: string;
  readonly value: number;
  readonly trend: 'up' | 'down' | 'flat';
}

export interface OrchestratorPort {
  readonly run: (request: OrchestrateRequest) => Promise<OrchestrateResponse>;
  readonly runBatch: (requests: readonly OrchestrateRequest[]) => Promise<readonly OrchestrateResponse[]>;
  readonly resolve: (assessmentId: string) => Promise<void>;
  readonly summarize: (nodeId: string) => Promise<readonly TelemetryPulse[]>;
}
