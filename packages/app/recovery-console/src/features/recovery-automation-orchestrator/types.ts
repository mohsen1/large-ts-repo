import type { StageName } from '@shared/automation-orchestration-runtime';
import type {
  AutomationSummary,
  AutomationExecutionConfig,
  AutomationTenantId,
  AutomationRun,
  AutomationStatus,
} from '@domain/recovery-automation-orchestrator';

export interface AutomationDashboardCommand {
  readonly id: string;
  readonly title: string;
  readonly stage: StageName;
  readonly enabled: boolean;
  readonly priority: 'critical' | 'high' | 'medium' | 'low';
  readonly tenant: AutomationTenantId;
}

export interface AutomationTelemetryDatum {
  readonly metric: string;
  readonly value: number;
  readonly at: string;
}

export interface AutomationViewModel {
  readonly tenant: AutomationTenantId;
  readonly status: AutomationStatus;
  readonly planId: string;
  readonly commands: readonly AutomationDashboardCommand[];
  readonly summary?: AutomationSummary;
  readonly metrics: readonly AutomationTelemetryDatum[];
  readonly config: AutomationExecutionConfig;
}

export interface UseRecoveryAutomationOrchestratorResult {
  readonly run: AutomationRun | undefined;
  readonly viewModel: AutomationViewModel;
  readonly isBusy: boolean;
  readonly errorMessage?: string;
  readonly execute: () => Promise<void>;
  readonly refresh: () => void;
  readonly setTenant: (tenant: AutomationTenantId) => void;
  readonly setPlanId: (planId: string) => void;
}
