import { CommandRunbook, OrchestrationPlan, RecoverySimulationResult, TenantId, WorkloadTarget, RecoverySignal } from '@domain/recovery-stress-lab';

export interface StressLabUiCommand {
  readonly id: string;
  readonly title: string;
  readonly runbook: CommandRunbook['id'];
  readonly stepCount: number;
}

export interface StressLabSummary {
  readonly tenantId: TenantId;
  readonly plan?: OrchestrationPlan;
  readonly simulation?: RecoverySimulationResult;
  readonly commands: readonly StressLabUiCommand[];
  readonly targets: readonly WorkloadTarget[];
  readonly signals: readonly RecoverySignal[];
  readonly status: 'idle' | 'planning' | 'simulating' | 'ready' | 'failed';
}
