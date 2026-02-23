import type { PlaybookEnvelope, RecoveryPlaybookId, RecoveryPlaybookQuery, RecoveryPlanId } from '@domain/recovery-playbooks';
import type { CampaignLane } from '@domain/recovery-playbook-lab';

export interface PlaybookLabRouteState {
  readonly tenant: string;
  readonly lens: CampaignLane;
}

export interface CandidateRow {
  readonly id: string;
  readonly title: string;
  readonly score: number;
  readonly timeMinutes: number;
  readonly confidence: number;
  readonly status: string;
  readonly lane: CampaignLane;
}

export interface PlaybookSelectionRow {
  readonly playbookId: RecoveryPlaybookId;
  readonly title: string;
  readonly score: number;
  readonly status: string;
  readonly expectedMinutes: number;
  readonly reasons: readonly string[];
}

export interface PlaybookTelemetryRow {
  readonly runId: string;
  readonly playbookId: RecoveryPlaybookId;
  readonly startedAt: string;
  readonly completedAt: string | undefined;
  readonly status: RecoveryPlaybookQuery['status'] | string;
  readonly selected: number;
  readonly failures: number;
}

export interface PlaybookLabConfig {
  readonly tenantId: string;
  readonly horizonHours: number;
  readonly refreshIntervalMs: number;
  readonly includeDeprecated: boolean;
}

export interface PlaybookCatalogState {
  readonly query: RecoveryPlaybookQuery;
  readonly policies: {
    readonly maxStepsPerRun: number;
    readonly allowedStatuses: readonly string[];
    readonly requiredLabels: readonly string[];
    readonly forbiddenChannels: readonly string[];
  };
  readonly playbooks: readonly PlaybookEnvelope['playbook'][];
  readonly loading: boolean;
  readonly lastSyncedAt: string;
}

export interface PlaybookLabPageState {
  readonly pageTitle: string;
  readonly config: PlaybookLabConfig;
  readonly rows: readonly PlaybookSelectionRow[];
  readonly catalog: PlaybookCatalogState;
  readonly history: readonly PlaybookTelemetryRow[];
  readonly activeRunId: RecoveryPlanId | undefined;
  readonly alerts: readonly string[];
  readonly busy: boolean;
  readonly health: string;
  readonly seeded: readonly SeededPlaybook[];
  readonly policy: PlaybookCatalogState['policies'];
  readonly onRefresh: () => Promise<void>;
  readonly onQueue: () => Promise<void>;
  readonly onSeed: () => Promise<void>;
  readonly onStartLastRun: () => Promise<void>;
}

export interface TelemetryRow {
  readonly runId: string;
  readonly at: string;
  readonly score: number;
  readonly lane: string;
  readonly latencyMs: number;
  readonly dryRun: boolean;
}

export interface SeededPlaybook {
  readonly id: RecoveryPlaybookId;
  readonly title: string;
  readonly tenant: string;
}

export type PlaybookLabPage = {
  readonly route: PlaybookLabRouteState;
};

export type PlaybookTelemetryPoint = {
  readonly runId: string;
  readonly lane: string;
  readonly score: number;
};

export type PlaybookLabWorkspaceSummary = PlaybookLabPageState;
