import {
  buildCampaignTrace,
  type CampaignId,
  type CampaignSessionId,
  type CampaignPhase,
  type CampaignPlanResult,
  type CampaignPlugin,
  type CampaignSeed,
  type CampaignTraceEvent,
  createCampaignId,
  createCampaignSessionId,
} from './types';
import { type TenantId } from '../models';

export interface CampaignPlanTimeline {
  readonly sessionId: CampaignSessionId;
  readonly seedCampaignId: string;
  readonly phases: readonly CampaignPhase[];
  readonly startedAt: string;
}

export interface CampaignRunbookSummary {
  readonly id: string;
  readonly planPhases: readonly CampaignPhase[];
  readonly trace: CampaignTraceEvent;
}

export const mapPlanToTimeline = (plan: CampaignPlanResult): CampaignPlanTimeline => {
  return {
    sessionId: plan.sessionId,
    seedCampaignId: plan.plan[0]?.requiredSignals?.[0] ? String(plan.plan[0].requiredSignals[0]) : 'none',
    phases: [...plan.phases],
    startedAt: new Date().toISOString(),
  };
};

export const mapCampaignTrace = (trace: CampaignTraceEvent): CampaignRunbookSummary => ({
  id: `${trace.tenantId}-${trace.timestamp}`,
  planPhases: ['seed', ...trace.route],
  trace,
});

export const mapPluginToBundle = async <T>(
  plugin: CampaignPlugin<unknown, T>,
  input: unknown,
  tenantId: TenantId,
  campaignId: CampaignId,
): Promise<T> => {
  const sessionId = createCampaignSessionId(tenantId, campaignId);
  const output = await plugin.run(input as never, {
    tenantId,
    campaignId: sessionId,
    activePhase: 'seed',
    route: ['campaign', 'seed'] as const,
    tags: ['bundle', plugin.kind],
  } as never);

  return output;
};

export const toSessionRows = (sessions: readonly CampaignId[]): readonly string[] => {
  return sessions.toSorted((left, right) => String(left).localeCompare(String(right)));
};

export const summarizeSeed = (seed: CampaignSeed): Readonly<Record<string, unknown>> => ({
  tenantId: String(seed.tenantId),
  bundleId: String(seed.bundleId),
  windowCount: seed.windows.length,
  windowDurationMinutes: seed.windows.reduce((total, window) => total + window.durationMinutes, 0),
  labels: [...seed.labels],
});

export const projectSeedMap = (seed: CampaignSeed): ReadonlyMap<string, CampaignSeed> => {
  return new Map([[String(seed.campaignId), seed]]);
};

export const planToWindowDigest = (plan: CampaignPlanResult): string => {
  return plan.plan
    .map((stage) => `${stage.stage}:${stage.label}:${stage.weight}`)
    .join('|');
};

export const buildSyntheticTrace = (tenantId: TenantId): CampaignTraceEvent => {
  return buildCampaignTrace(tenantId, createCampaignId(tenantId, 'synthetic'));
};
