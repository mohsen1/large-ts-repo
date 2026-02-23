import { z } from 'zod';
import type { Brand, DeepReadonly } from '@shared/type-level';
import type { RecoveryPlaybook, RecoveryPlaybookId, RecoveryPlaybookQuery, RecoveryPlanExecution, RecoveryStep } from '@domain/recovery-playbooks';

export type PlaybookLabTenantId = Brand<string, 'TenantId'>;
export type PlaybookLabRunId = Brand<string, 'PlaybookLabRunId'>;
export type PlaybookLabCampaignId = Brand<string, 'PlaybookLabCampaignId'>;
export type PlaybookLabProfileVersion = `v${number}`;

export type CampaignLane = 'stability' | 'performance' | 'compliance' | 'recovery';
export type CampaignStatus = 'draft' | 'active' | 'dry-run' | 'archive';
export type ForecastTier = 'near' | 'mid' | 'far';

export interface LabConstraintWindow {
  readonly fromUtc: string;
  readonly toUtc: string;
  readonly timezone: string;
}

export interface LabExecutionEnvelope {
  readonly score: number;
  readonly budget: number;
  readonly rationale: readonly string[];
  readonly signals: readonly string[];
}

export interface LabStepIntent {
  readonly step: RecoveryStep;
  readonly score: number;
  readonly blockers: readonly string[];
}

export interface PlaybookLabCandidate {
  readonly playbook: RecoveryPlaybook;
  readonly query: RecoveryPlaybookQuery;
  readonly plan: RecoveryPlanExecution;
  readonly riskEnvelope: LabExecutionEnvelope;
  readonly estimatedRecoveryTimeMinutes: number;
  readonly forecastConfidence: number;
  readonly constraintsSatisfied: boolean;
  readonly campaign: PlaybookLabCampaignId;
  readonly lane: CampaignLane;
  readonly reasons: readonly string[];
}

export interface PlaybookLabSignal {
  readonly channel: 'ops' | 'risk' | 'finance' | 'governance';
  readonly value: number;
  readonly detail: string;
  readonly tenant: string;
  readonly observedAt: string;
}

export interface PlaybookLabCampaignPlan {
  readonly id: PlaybookLabCampaignId;
  readonly tenantId: PlaybookLabTenantId;
  readonly name: string;
  readonly owner: string;
  readonly lens: CampaignLane;
  readonly status: CampaignStatus;
  readonly window: LabConstraintWindow;
  readonly candidates: readonly PlaybookLabCandidate[];
  readonly signals: readonly PlaybookLabSignal[];
  readonly profile: {
    readonly requestedBy: string;
    readonly version: PlaybookLabProfileVersion;
    readonly allowedStatus: readonly RecoveryPlaybook['status'][];
    readonly maxDurationMinutes: number;
    readonly maxSteps: number;
  };
}

export interface PlaybookLabTelemetryPoint {
  readonly runId: PlaybookLabRunId;
  readonly at: string;
  readonly campaignId: PlaybookLabCampaignId;
  readonly score: number;
  readonly latencyBudgetMs: number;
  readonly lane: CampaignLane;
  readonly isDryRun: boolean;
}

export interface PlaybookLabSchedule {
  readonly date: string;
  readonly runAt: string;
  readonly lane: CampaignLane;
  readonly runId: PlaybookLabRunId;
  readonly campaignId: PlaybookLabCampaignId;
  readonly forecastTier: ForecastTier;
  readonly expectedDurationMinutes: number;
}

export interface PlaybookLabExecutionState {
  readonly runId: PlaybookLabRunId;
  readonly campaignId: PlaybookLabCampaignId;
  readonly status: 'pending' | 'ready' | 'running' | 'paused' | 'completed' | 'errored';
  readonly selectedCandidate: RecoveryPlaybookId | undefined;
  readonly candidates: readonly PlaybookLabCandidate[];
  readonly telemetry: Readonly<DeepReadonly<readonly PlaybookLabTelemetryPoint[]>>;
  readonly startedAt: string | undefined;
  readonly completedAt: string | undefined;
}

export const LaneSchema = z.enum(['stability', 'performance', 'compliance', 'recovery']) satisfies z.ZodType<CampaignLane>;
export const StatusSchema = z.enum(['draft', 'active', 'dry-run', 'archive']) satisfies z.ZodType<CampaignStatus>;
export const TierSchema = z.enum(['near', 'mid', 'far']) satisfies z.ZodType<ForecastTier>;

const CampaignSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  name: z.string().min(3),
  owner: z.string().min(2),
  lens: LaneSchema,
  status: StatusSchema,
  window: z.object({
    fromUtc: z.string(),
    toUtc: z.string(),
    timezone: z.string().min(1),
  }),
  candidates: z.array(z.unknown()),
  signals: z.array(z.object({
    channel: z.enum(['ops', 'risk', 'finance', 'governance']),
    value: z.number(),
    detail: z.string(),
    tenant: z.string(),
    observedAt: z.string(),
  })),
  profile: z.object({
    requestedBy: z.string().min(2),
    version: z.string().regex(/^v\d+$/),
    allowedStatus: z.array(z.enum(['draft', 'published', 'deprecated', 'retired'])),
    maxDurationMinutes: z.number().positive(),
    maxSteps: z.number().int().positive(),
  }),
});

export const PlaybookLabCampaignSchema = CampaignSchema.transform((campaign: z.infer<typeof CampaignSchema>): PlaybookLabCampaignPlan => ({
  ...campaign,
  id: campaign.id as PlaybookLabCampaignId,
  tenantId: campaign.tenantId as PlaybookLabTenantId,
  profile: {
    ...campaign.profile,
    version: campaign.profile.version as PlaybookLabProfileVersion,
  },
  candidates: campaign.candidates as PlaybookLabCandidate[],
  status: campaign.status,
  window: campaign.window,
}));
