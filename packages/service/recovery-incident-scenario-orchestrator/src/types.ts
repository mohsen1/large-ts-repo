import type {
  IncidentEnvelope,
  RecoveryBlueprint,
  RecoveryPlan,
  RecoveryRun,
  RecoverySignal,
  ScenarioId,
  TenantId,
} from '@domain/recovery-scenario-orchestration';

export interface ServiceInput {
  readonly tenantId: TenantId;
  readonly scenarioId: ScenarioId;
  readonly incident: IncidentEnvelope;
  readonly blueprint: RecoveryBlueprint;
  readonly signals: readonly RecoverySignal[];
  readonly actorId: string;
}

export interface ServiceState {
  readonly tenantId: TenantId;
  readonly scenarioId: ScenarioId;
  readonly activePlan: RecoveryPlan | null;
  readonly runs: readonly RecoveryRun[];
  readonly planHistory: readonly RecoveryPlan[];
  readonly signalCount: number;
  readonly lastUpdated: string;
}

export interface ExecutionSummary {
  readonly planId: RecoveryPlan['id'];
  readonly runCount: number;
  readonly completionRate: number;
}

export interface ServiceEvent {
  readonly type: 'plan_created' | 'plan_promoted' | 'run_updated' | 'command_acked';
  readonly correlationId: string;
  readonly timestamp: string;
  readonly payload: Record<string, unknown>;
}
