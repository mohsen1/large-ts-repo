import type {
  CoordinationPlanCandidate,
  CoordinationSelectionResult,
} from '@domain/recovery-coordination';
import type {
  CoordinationAttemptInput,
  CoordinationAttemptReport,
} from '@service/recovery-coordination-orchestrator';
import type { RecoveryRunState } from '@domain/recovery-orchestration';
import type { RecoveryProgram } from '@domain/recovery-orchestration';
import type { RecoveryRunId } from '@domain/recovery-orchestration';
import type { RecoveryCoordinationCommandCenter } from '@service/recovery-coordination-orchestrator';

export interface CoordinationDashboardFilters {
  readonly tenant?: string;
  readonly tenantScope?: string;
  readonly minPriority?: number;
  readonly includeCompleted: boolean;
}

export interface CoordinationSignal {
  readonly source: string;
  readonly severity: 'low' | 'medium' | 'high';
  readonly title: string;
  readonly createdAt: string;
}

export interface CoordinationDashboardCommand {
  readonly commandId: string;
  readonly tenant: string;
  readonly operator: string;
  readonly windowMinutes: number;
  readonly allowFallback: boolean;
  readonly initiatedAt: string;
}

export interface CoordinationDashboardState {
  readonly program: RecoveryProgram | null;
  readonly latestReport: CoordinationAttemptReport | null;
  readonly candidate: CoordinationPlanCandidate | null;
  readonly selectedSignals: readonly string[];
  readonly canExecute: boolean;
  readonly canCancel: boolean;
  readonly commandCenter: RecoveryCoordinationCommandCenter | null;
  readonly isBusy: boolean;
  readonly tenant: string;
}

export interface CoordinationDashboardInput {
  readonly commandCenter: RecoveryCoordinationCommandCenter;
  readonly tenant: string;
  readonly catalog: readonly CoordinationAttemptInput[];
  readonly selection: CoordinationSelectionResult | null;
}

export interface CoordinationDashboardHistory {
  readonly commandId: string;
  readonly runId: string;
  readonly accepted: boolean;
  readonly commandType: string;
}

export interface CoordinationAttemptEnvelope {
  readonly tenant: string;
  readonly runId: RecoveryRunId;
  readonly state: RecoveryRunState;
  readonly input: CoordinationAttemptInput;
}

export const defaultDashboardState: CoordinationDashboardState = {
  program: null,
  latestReport: null,
  candidate: null,
  selectedSignals: [],
  canExecute: false,
  canCancel: false,
  commandCenter: null,
  isBusy: false,
  tenant: 'global',
};
