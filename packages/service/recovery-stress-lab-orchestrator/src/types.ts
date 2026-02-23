import {
  CommandRunbookId,
  OrchestrationPlan,
  RecoverySimulationResult,
  StressRunState,
  WorkloadTarget,
  TenantId,
  RecoverySignal,
  SeverityBand,
  RecoverySignalId,
} from '@domain/recovery-stress-lab';

export interface StressLabEngineConfig {
  readonly tenantId: TenantId;
  readonly band: SeverityBand;
  readonly profileHint: 'conservative' | 'normal' | 'agile';
  readonly selectedRunbooks: readonly CommandRunbookId[];
}

export interface StressLabDraft {
  readonly name: string;
  readonly description: string;
  readonly band: SeverityBand;
  readonly selectedSignals: readonly RecoverySignalId[];
  readonly selectedRunbookIds: readonly CommandRunbookId[];
}

export interface StressLabCommand {
  readonly id: string;
  readonly workloadId: string;
  readonly command: string;
  readonly priority: number;
}

export interface StressLabSession {
  readonly tenantId: TenantId;
  readonly runState: StressRunState;
  readonly commands: ReadonlyArray<StressLabCommand>;
  readonly selectedCommandIndex: number;
}

export interface StressLabWorkspace {
  readonly tenantId: TenantId;
  readonly runbooks: ReadonlyArray<OrchestrationPlan['runbooks'][number]>;
  readonly targetWorkloads: ReadonlyArray<WorkloadTarget>;
  readonly knownSignals: ReadonlyArray<RecoverySignal>;
  readonly config: StressLabEngineConfig;
}

export interface StressLabDecision {
  readonly plan: OrchestrationPlan | null;
  readonly simulation: RecoverySimulationResult | null;
  readonly errors: ReadonlyArray<string>;
}
