import { RecoverySimulationResult, OrchestrationPlan, RecoverySignal, CommandRunbook, TenantId, StressRunState, WorkloadTarget } from '@domain/recovery-stress-lab';

export interface StreamStressLabWorkspace {
  readonly tenantId: TenantId;
  readonly plan: OrchestrationPlan | null;
  readonly simulation: RecoverySimulationResult | null;
  readonly runbooks: readonly CommandRunbook[];
  readonly runbookSignals: readonly RecoverySignal[];
  readonly targets: readonly WorkloadTarget[];
  readonly configBand: 'low' | 'medium' | 'high' | 'critical';
  readonly state: StressRunState;
}

export interface StreamStressLabViewModel {
  readonly tenantId: TenantId;
  readonly hasPlan: boolean;
  readonly hasSimulation: boolean;
  readonly planEstimateMinutes: number;
  readonly simulationRisk: number;
  readonly simulationSla: number;
  readonly signalCount: number;
  readonly runbookCount: number;
  readonly latestNote: string;
}

export interface StreamStressLabActionResult {
  readonly success: boolean;
  readonly workspace: StreamStressLabWorkspace | null;
  readonly message: string;
}
