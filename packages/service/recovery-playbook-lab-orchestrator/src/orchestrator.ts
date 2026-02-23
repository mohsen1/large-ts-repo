import { fail, ok } from '@shared/result';
import { normalizeLimit, withBrand } from '@shared/core';
import { buildWorkspacePlan, refineByCommandHistory, selectCandidateByIntent } from './planner';
import { scheduleRunBatch } from './scheduler';
import { PlaybookLabRepositoryBridge, flattenTenantBuckets } from './adapters';
import { enrichCandidateSignals, inferTelemetryFromState } from './telemetry';
import type {
  PlaybookLabWorkspaceInput,
  PlaybookLabResult,
  PlaybookLabWorkspaceContext,
  PlaybookLabSnapshot,
  PlaybookRunCommand,
} from './types';
import type { PlaybookLabCampaignPlan, PlaybookLabExecutionState, PlaybookLabSignal, PlaybookLabTenantId } from '@domain/recovery-playbook-lab';
import type { RecoveryPlaybookRepository } from '@data/recovery-playbook-store';

const summarizeState = (state: PlaybookLabExecutionState): Readonly<{
  campaignId: string;
  telemetryCount: number;
  forecast: number;
  scoreByLane: Readonly<Record<string, number>>;
}> => {
  const summary = inferTelemetryFromState(state);
  const forecast = Object.values(summary.top).reduce((acc, score) => acc + score, 0);
  return {
    campaignId: summary.campaignId,
    telemetryCount: summary.points.length,
    forecast,
    scoreByLane: summary.top,
  };
};

const mapContext = (campaign: PlaybookLabCampaignPlan, tenantId: PlaybookLabTenantId): PlaybookLabWorkspaceContext => ({
  tenantId,
  campaignId: campaign.id,
  planVersion: campaign.profile.version,
  status: campaign.status,
  statusReason: campaign.status === 'active' ? 'initialized' : 'draft',
  window: campaign.window,
  profile: {
    requestedBy: campaign.profile.requestedBy,
    allowedStatus: campaign.profile.allowedStatus,
    version: campaign.profile.version,
    maxDurationMinutes: campaign.profile.maxDurationMinutes,
    maxSteps: campaign.profile.maxSteps,
  },
});

export const bootstrapPlaybookLab = async (
  input: PlaybookLabWorkspaceInput,
  repository: RecoveryPlaybookRepository,
): Promise<PlaybookLabResult<PlaybookLabWorkspaceContext>> => {
  const bridge = new PlaybookLabRepositoryBridge(repository);
  const query = {
    ...input.searchQuery,
    tenantId: withBrand(input.tenantId, 'TenantId'),
    status: 'published' as const,
    limit: normalizeLimit(input.maxCandidates),
  };
  const queryResult = await bridge.queryCandidates(query);
  if (!queryResult.ok) return fail('workspace-initialization-failed');

  const bucket = flattenTenantBuckets(queryResult.value);
  const selectedPlaybooks = bucket[String(input.tenantId)] ?? Object.values(bucket).flat();
  const planResult = buildWorkspacePlan(input, selectedPlaybooks);
  if (!planResult.ok) {
    return fail('campaign-empty');
  }
  return ok(mapContext(planResult.value, input.tenantId));
};

const buildExecutionState = async (
  campaign: PlaybookLabCampaignPlan,
  command: PlaybookRunCommand,
): Promise<PlaybookLabResult<readonly PlaybookLabExecutionState[]>> => {
  const scheduled = scheduleRunBatch(campaign, {
    campaign,
    command: command.command,
    runId: command.runId,
  });
  if (!scheduled.ok) return fail('invalid-command');
  return ok(scheduled.value);
};

export const runLabCommand = async (
  command: PlaybookRunCommand,
  campaign: PlaybookLabCampaignPlan,
  tenantSignals: readonly string[] = [],
): Promise<PlaybookLabResult<PlaybookLabSnapshot>> => {
  const pick = campaign.candidates.find((candidate) => candidate.playbook.id === command.candidate.playbook.id) ?? campaign.candidates[0];
  if (!pick) return fail('campaign-empty');

  const enriched = enrichCandidateSignals(pick, command.runId);
  const updatedCampaign = selectCandidateByIntent(campaign, enriched.playbook.id);
  const executed = await buildExecutionState(updatedCampaign, {
    ...command,
    candidate: enriched,
  });
  if (!executed.ok) return fail('invalid-command');

  const state = executed.value[0];
  const selected = refineByCommandHistory(updatedCampaign, [enriched.playbook.id], Math.max(1, tenantSignals.length));
  const signals: readonly PlaybookLabSignal[] = tenantSignals.map((signal, index) => ({
    channel: 'ops',
    value: index + 1,
    detail: signal,
    tenant: campaign.tenantId,
    observedAt: state.startedAt ?? new Date().toISOString(),
  }));

  return ok({
    campaign: selected,
    candidates: selected.candidates,
    schedule: [],
    telemetry: {
      state,
      signals,
      cursor: undefined,
    },
  });
};

export const hydrateSnapshot = (
  campaign: PlaybookLabCampaignPlan,
  state: PlaybookLabExecutionState,
): PlaybookLabSnapshot => ({
  campaign,
  candidates: campaign.candidates,
  schedule: [],
  telemetry: {
    state,
    signals: [],
    cursor: undefined,
  },
});

export const previewCampaignTelemetry = (state: PlaybookLabExecutionState) => summarizeState(state);
