import type { OrchestratorEnvelope, OrchestratorState } from '@service/recovery-synthesis-orchestrator';
import type { ScenarioBlueprint, ScenarioConstraint, ScenarioPlan, ScenarioSignal, SimulationResult } from '@domain/recovery-scenario-lens';

export type SynthesisPanelMode = 'plan' | 'simulate' | 'review';

export interface SynthesisPanelState {
  readonly mode: SynthesisPanelMode;
  readonly runId?: string;
  readonly envelope?: OrchestratorEnvelope;
  readonly blueprint?: ScenarioBlueprint;
  readonly plan?: ScenarioPlan;
  readonly signals: readonly ScenarioSignal[];
  readonly constraints: readonly ScenarioConstraint[];
  readonly simResult?: SimulationResult;
  readonly error?: string;
  readonly loading: boolean;
}

export interface SynthesisCommand {
  readonly id: string;
  readonly command: string;
  readonly icon: 'play' | 'pause' | 'stop' | 'refresh';
}

export interface SynthesisAction {
  readonly name: string;
  readonly description: string;
  readonly disabled: boolean;
}

export interface SynthesisWorkspaceSnapshot {
  readonly state: SynthesisPanelState;
  readonly orchestratorState: OrchestratorState;
}
