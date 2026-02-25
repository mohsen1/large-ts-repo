import { z } from 'zod';
import type {
  CampaignRunTemplate,
  CampaignRunResult,
  IncidentSignal,
  TenantId,
  WorkspaceId,
} from '@domain/fault-intel-orchestration';

export const tenantIdentifier = z.string().nonempty();
export const campaignIdentifier = z.string().nonempty();
export const workspaceIdentifier = z.string().nonempty();
export const operatorIdentifier = z.string().nonempty();

const metricSchema = z.object({
  key: z.string(),
  value: z.number(),
  unit: z.string(),
  tags: z.array(z.string()),
});

const signalSchema = z.object({
  signalId: z.string(),
  tenantId: tenantIdentifier,
  campaignId: campaignIdentifier,
  workspaceId: workspaceIdentifier,
  transport: z.enum(['mesh', 'fabric', 'cockpit', 'orchestration', 'console']),
  observedAt: z.string(),
  detector: z.string(),
  severity: z.enum(['notice', 'advisory', 'warning', 'critical']),
  title: z.string(),
  detail: z.string(),
  metrics: z.array(metricSchema),
});

export const campaignTemplateSchema = z.object({
  campaignId: campaignIdentifier,
  tenantId: tenantIdentifier,
  strategy: z.string(),
  policyIds: z.array(z.string()),
  createdBy: operatorIdentifier,
  constraints: z.record(z.unknown()),
});

const campaignPolicySchema = z.object({
  policyId: z.string(),
  name: z.string(),
  description: z.string(),
  requiredStages: z.array(z.string()),
  requiredTransports: z.array(z.string()),
  maxConcurrency: z.number().int().nonnegative(),
  timeoutMs: z.number().int().nonnegative(),
});

const campaignRunSchema = z.object({
  planId: z.string(),
  campaign: z.object({
    campaignId: campaignIdentifier,
    tenantId: tenantIdentifier,
    workspaceId: workspaceIdentifier,
  }),
  signals: z.array(signalSchema),
  policy: campaignPolicySchema,
  executedAt: z.string(),
  riskScore: z.number().min(0).max(100),
});

const runRecordSchema = z.object({
  runId: z.string().nonempty(),
  tenantId: tenantIdentifier,
  workspaceId: workspaceIdentifier,
  campaignId: campaignIdentifier,
  template: campaignTemplateSchema,
  plan: campaignRunSchema,
  rawSignals: z.array(signalSchema),
  summary: z.record(z.number()),
  status: z.enum(['created', 'planning', 'running', 'finalized', 'aborted']),
});

const campaignStoreStateSchema = z.object({
  tenantId: tenantIdentifier,
  workspaceId: workspaceIdentifier,
  catalog: z.array(campaignTemplateSchema),
  runs: z.array(runRecordSchema),
});

export type CampaignTemplateRecord = CampaignRunTemplate;
export type CampaignRunRecord = CampaignRunResult;
export interface CampaignStoreRecord {
  readonly runId: CampaignRunResult['planId'];
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly campaignId: CampaignTemplateRecord['campaignId'];
  readonly template: CampaignTemplateRecord;
  readonly plan: CampaignRunRecord;
  readonly rawSignals: IncidentSignal[];
  readonly summary: Readonly<Record<IncidentSignal['severity'], number>>;
  readonly status: 'created' | 'planning' | 'running' | 'finalized' | 'aborted';
}
export type CampaignSignalRecord = IncidentSignal;

export const campaignTemplateSchemaGuard = {
  parse: (value: unknown) => campaignTemplateSchema.parse(value),
  safeParse: (value: unknown) => campaignTemplateSchema.safeParse(value),
};

const severityScale: Record<IncidentSignal['severity'], number> = {
  notice: 0,
  advisory: 1,
  warning: 2,
  critical: 3,
};

export const scoreCampaignSignal = (signal: IncidentSignal): number => severityScale[signal.severity] * signal.metrics.length;

export const normalizeCampaignStoreInput = (template: CampaignRunTemplate): CampaignTemplateRecord => {
  return {
    campaignId: template.campaignId,
    tenantId: template.tenantId,
    strategy: template.strategy,
    policyIds: template.policyIds,
    createdBy: template.createdBy,
    constraints: template.constraints,
  };
};

export const normalizeRunResult = (run: CampaignRunResult): CampaignRunRecord => {
  return {
    planId: run.planId,
    campaign: run.campaign,
    signals: run.signals,
    policy: run.policy,
    executedAt: run.executedAt,
    riskScore: run.riskScore,
  } as CampaignRunRecord;
};

export const validateStoreState = (tenantId: TenantId, workspaceId: WorkspaceId, raw: unknown) => {
  const payload = (typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {});
  const parsed = campaignStoreStateSchema.safeParse({
    tenantId,
    workspaceId,
    ...payload,
  });

  return {
    tenantId,
    workspaceId,
    ok: parsed.success,
    issues: parsed.success ? [] : parsed.error.format(),
  };
};

export const inferRunSummary = (
  run: CampaignRunRecord,
): Readonly<Record<IncidentSignal['severity'], number>> => {
  const seed: Record<IncidentSignal['severity'], number> = {
    notice: 0,
    advisory: 0,
    warning: 0,
    critical: 0,
  };
  return run.signals.reduce<Record<IncidentSignal['severity'], number>>((acc: Record<IncidentSignal['severity'], number>, signal: IncidentSignal) => {
    return {
      ...acc,
      [signal.severity]: acc[signal.severity] + 1,
    };
  }, seed);
};
