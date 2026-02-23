import type {
  RecoveryPlan,
  RecoveryRun,
  RecoverySignal,
  ConstraintState,
} from '@domain/recovery-scenario-orchestration';
import type { ServiceEvent } from '@service/recovery-incident-scenario-orchestrator';

export type ScenarioViewMode = 'live' | 'historical' | 'dry-run';

export interface ScenarioWorkspace {
  readonly id: string;
  readonly tenantId: string;
  readonly scenarioId: string;
  readonly mode: ScenarioViewMode;
  readonly plan: RecoveryPlan | null;
  readonly runs: readonly RecoveryRun[];
  readonly signals: readonly RecoverySignal[];
  readonly constraintCount: number;
  readonly blockingCount: number;
  readonly healthScore: number;
  readonly updatedAt: string;
  readonly active: boolean;
}

export interface SignalBucket {
  readonly minute: string;
  readonly values: readonly RecoverySignal[];
  readonly score: number;
}

export interface ConstraintPanelState {
  readonly state: ConstraintState;
  readonly score: number;
  readonly title: string;
}

export interface ScenarioEvent {
  readonly id: string;
  readonly type: ScenarioEventType;
  readonly at: string;
  readonly title: string;
  readonly detail: string;
}

export type ScenarioEventType =
  | 'plan'
  | 'run'
  | 'constraint'
  | 'signal'
  | ServiceEvent['type'];

export interface UseScenarioOrchestratorInput {
  readonly tenantId: string;
  readonly scenarioId: string;
  readonly incidentId: string;
}
