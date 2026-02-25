import type {
  AutonomyScope,
  AutonomySignalEnvelope,
  AutonomyPlan,
  AutonomySignalInput,
} from '@domain/recovery-autonomy-graph';

export interface AutonomyPanelFilters {
  readonly tenantId: string;
  readonly graphId: string;
  readonly scope: AutonomyScope;
  readonly horizonMinutes: number;
}

export interface AutonomyRunStatus {
  readonly running: boolean;
  readonly completed: boolean;
  readonly summary?: string;
}

export interface AutonomyRunRow {
  readonly runId: string;
  readonly planId: string;
  readonly scope: AutonomyScope;
  readonly signalCount: number;
  readonly lastObservedAt: string;
  readonly healthLabel: 'healthy' | 'degraded' | 'failing';
}

export interface AutonomySignalEvent {
  readonly signal: AutonomySignalEnvelope;
}

export interface CommandSpec {
  readonly command: string;
  readonly options: Readonly<Record<string, string>>;
}

export interface SnapshotBundle {
  readonly filters: AutonomyPanelFilters;
  readonly signals: readonly AutonomySignalEvent[];
  readonly plan?: AutonomyPlan;
  readonly input?: AutonomySignalInput;
  readonly status: AutonomyRunStatus;
}
