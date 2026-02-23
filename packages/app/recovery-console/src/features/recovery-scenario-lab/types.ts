import type {
  CandidateWindow,
  ConstraintSnapshot,
  RecoveryPlan,
  RecoveryRun,
  RecoverySignal,
} from '@domain/recovery-scenario-orchestration';

export interface ScenarioWorkspaceConfig {
  readonly tenantId: string;
  readonly incidentId: string;
  readonly scenarioId: string;
  readonly scenarioName: string;
}

export interface ScenarioSimulationInput {
  readonly seed: number;
  readonly durationMinutes: number;
  readonly replayMetrics: readonly string[];
}

export interface ScenarioWorkspaceState {
  readonly plan?: RecoveryPlan;
  readonly constraints: readonly ConstraintSnapshot[];
  readonly windows: readonly CandidateWindow[];
  readonly runs: readonly RecoveryRun[];
  readonly snapshots: readonly RecoverySignalLike[];
  readonly active: boolean;
}

export interface RecoverySignalLike {
  readonly id: string;
  readonly metric: string;
  readonly value: number;
  readonly observedAt: string;
  readonly dimensions?: Readonly<Record<string, string>>;
}

export interface ScenarioWorkspaceResult {
  readonly config: ScenarioWorkspaceConfig;
  readonly state: ScenarioWorkspaceState;
  readonly simulation?: {
    readonly planId: string;
    readonly durationMinutes: number;
    readonly riskScore: number;
    readonly events: readonly RecoverySignal[];
  };
  readonly lastBatchCount: number;
}
