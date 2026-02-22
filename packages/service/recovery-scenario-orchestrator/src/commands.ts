import type { TenantId } from '@shared/type-level';
import type { RecoverySignalInput } from '@domain/recovery-scenario-planner/src';

export interface ScenarioOrchestrationCommand {
  readonly tenantId: TenantId;
  readonly signals: readonly RecoverySignalInput[];
  readonly policyVersion: string;
  readonly planHorizonHours?: number;
}

export interface OrchestrationResult {
  readonly scenarioId: string;
  readonly tenantId: TenantId;
  readonly status: 'approved' | 'draft' | 'canceled' | 'executing';
  readonly eventIds: readonly string[];
  readonly warningCount: number;
}
