import type { Result } from '@shared/result';
import type {
  PlaybookLabCampaignPlan,
  PlaybookLabExecutionState,
  PlaybookLabSignal,
  PlaybookLabCandidate,
  PlaybookLabCampaignId,
  PlaybookLabRunId,
  PlaybookLabSchedule,
  CampaignLane,
  CampaignStatus,
  LabConstraintWindow,
  PlaybookLabProfileVersion,
  PlaybookLabTenantId,
} from '@domain/recovery-playbook-lab';
import type { RecoveryPlaybookQuery } from '@domain/recovery-playbooks';
import type { PlaybookQueryCursor, PlaybookEnvelope, RecoveryPlaybookRepository } from '@data/recovery-playbook-store';

export interface PlaybookLabWorkspaceInput {
  readonly tenantId: PlaybookLabTenantId;
  readonly owner: string;
  readonly lens: CampaignLane;
  readonly window: LabConstraintWindow;
  readonly maxDurationMinutes: number;
  readonly maxCandidates: number;
  readonly searchQuery?: RecoveryPlaybookQuery;
}

export interface PlaybookLabWorkspaceContext {
  readonly tenantId: PlaybookLabTenantId;
  readonly campaignId: PlaybookLabCampaignId;
  readonly planVersion: PlaybookLabProfileVersion;
  readonly status: CampaignStatus;
  readonly statusReason: string;
  readonly window: LabConstraintWindow;
  readonly profile: {
    readonly requestedBy: string;
    readonly version: PlaybookLabProfileVersion;
    readonly allowedStatus: readonly Exclude<RecoveryPlaybookQuery['status'], undefined>[];
    readonly maxDurationMinutes: number;
    readonly maxSteps: number;
  };
}

export interface PlaybookRunCommand {
  readonly runId: PlaybookLabRunId;
  readonly candidate: PlaybookLabCandidate;
  readonly command: 'execute' | 'pause' | 'resume' | 'refresh';
  readonly requestedBy: string;
}

export interface PlaybookLabSnapshot {
  readonly campaign: PlaybookLabCampaignPlan;
  readonly candidates: readonly PlaybookLabCandidate[];
  readonly schedule: readonly PlaybookLabSchedule[];
  readonly telemetry: {
    readonly state: PlaybookLabExecutionState;
    readonly signals: readonly PlaybookLabSignal[];
    readonly cursor: PlaybookQueryCursor | undefined;
  };
  readonly repository?: RecoveryPlaybookRepository;
}

export type PlaybookLabError = 'workspace-initialization-failed' | 'repository-missing-playbook' | 'campaign-empty' | 'invalid-command';

export type PlaybookLabResult<T> = Result<T, PlaybookLabError>;

export interface PlaybookLabRepositoryAdapter {
  readonly queryCandidates: (query: RecoveryPlaybookQuery) => Promise<PlaybookLabResult<readonly PlaybookEnvelope[]>>;
  readonly getById: (id: PlaybookEnvelope['playbook']['id']) => Promise<PlaybookLabResult<PlaybookEnvelope | undefined>>;
  readonly saveEnvelope: (envelope: PlaybookEnvelope) => Promise<PlaybookLabResult<PlaybookEnvelope>>;
}
