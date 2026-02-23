import type {
  RecoveryPlaybook,
  RecoveryPlanExecution,
  RecoveryPlaybookQuery,
  RecoveryPlaybookContext,
  RecoveryPlaybookId,
  RecoveryPlanId,
  PlaybookSignal,
  PlaybookSelectionPolicy,
} from '@domain/recovery-playbooks';

export interface PlaybookLabConfig {
  readonly tenantId: string;
  readonly horizonHours: number;
  readonly refreshIntervalMs: number;
  readonly includeDeprecated: boolean;
}

export interface PlaybookSelectionRow {
  readonly playbookId: RecoveryPlaybookId;
  readonly title: string;
  readonly score: number;
  readonly status: 'queued' | 'running' | 'paused' | 'completed' | 'failed';
  readonly expectedMinutes: number;
  readonly reasons: readonly string[];
}

export interface PlaybookCatalogState {
  readonly query: RecoveryPlaybookQuery;
  readonly policies: PlaybookSelectionPolicy;
  readonly playbooks: readonly RecoveryPlaybook[];
  readonly loading: boolean;
  readonly lastSyncedAt: string;
}

export interface PlaybookTelemetryRow {
  readonly runId: RecoveryPlanId;
  readonly playbookId: RecoveryPlaybookId;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly status: RecoveryPlanExecution['status'];
  readonly selected: number;
  readonly failures: number;
}

export interface PlaybookLabContext {
  readonly tenantId: string;
  readonly context: RecoveryPlaybookContext;
  readonly signals: readonly PlaybookSignal[];
}

export interface PlaybookLabAction {
  readonly type: 'refresh' | 'queue' | 'start' | 'complete' | 'abort' | 'seed';
  readonly payload?: {
    readonly runId?: RecoveryPlanId;
    readonly portfolioId?: string;
    readonly tenant?: string;
  };
}

export interface PlaybookLabPageState {
  readonly pageTitle: string;
  readonly config: PlaybookLabConfig;
  readonly rows: readonly PlaybookSelectionRow[];
  readonly catalog: PlaybookCatalogState;
  readonly history: readonly PlaybookTelemetryRow[];
  readonly activeRunId?: RecoveryPlanId;
  readonly alerts: readonly string[];
  readonly busy: boolean;
  readonly health: string;
  readonly seeded: readonly SeededPlaybook[];
  readonly policy: PlaybookSelectionPolicy;
  readonly onRefresh: () => void;
  readonly onQueue: () => void;
  readonly onSeed: () => void;
  readonly onStartLastRun: () => void;
}

export interface SeededPlaybook {
  readonly id: string;
  readonly title: string;
  readonly tenant: string;
}
