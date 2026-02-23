import type {
  PlanCandidate,
  ScenarioBlueprint,
  ScenarioConstraint,
  ScenarioMetrics,
  ScenarioPlan,
  ScenarioReadModel,
  SimulationResult,
  SimulationFrame,
  ScoreSummary,
  ScenarioProfile,
  ScenarioPolicyInput,
  ScenarioSignal,
} from '@domain/recovery-scenario-lens';

export type OrchestrationRunId = `${string}-run`;
export type OrchestrationStatus = 'draft' | 'ready' | 'simulated' | 'approved' | 'executed' | 'failed';

export interface OrchestrationInput {
  readonly blueprint: ScenarioBlueprint;
  readonly profile: ScenarioProfile;
  readonly policyInputs: readonly ScenarioPolicyInput[];
  readonly constraints: readonly ScenarioConstraint[];
  readonly signals: readonly ScenarioSignal[];
  readonly initiatedBy: string;
}

export interface OrchestratorEnvelope {
  readonly runId: OrchestrationRunId;
  readonly status: OrchestrationStatus;
  readonly model: ScenarioReadModel;
  readonly warnings: readonly string[];
  readonly metrics: ScenarioMetrics;
}

export interface OrchestratorState {
  readonly currentRun?: OrchestratorEnvelope;
  readonly planHistory: readonly string[];
  readonly activeSignals: readonly ScenarioSignal[];
}

export interface PlannerOutput {
  readonly candidates: readonly PlanCandidate[];
  readonly score: ScoreSummary;
  readonly constraints: readonly ScenarioConstraint[];
  readonly warnings: readonly string[];
}

export interface SimulationOutput {
  readonly plan: ScenarioPlan;
  readonly simulation: SimulationResult;
  readonly timelineFrames: readonly SimulationFrame[];
  readonly violations: readonly string[];
}
