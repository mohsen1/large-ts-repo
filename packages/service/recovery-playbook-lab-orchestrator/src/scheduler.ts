import { fail, ok, type Result } from '@shared/result';
import { buildLaneSchedule, mergeSchedules } from '@domain/recovery-playbook-lab';
import { buildSignalBatch } from '@domain/recovery-playbook-lab';
import type {
  PlaybookLabCampaignPlan,
  PlaybookLabSchedule,
  PlaybookLabExecutionState,
  PlaybookLabRunId,
} from '@domain/recovery-playbook-lab';
import { withBrand } from '@shared/core';

const normalize = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 1;
  return Math.round(Math.min(360, value));
};

export const buildCampaignSchedule = (
  campaign: PlaybookLabCampaignPlan,
): readonly PlaybookLabSchedule[] => {
  const base = buildLaneSchedule(
    campaign.id,
    campaign.lens,
    campaign.window.fromUtc,
    normalize(campaign.profile.maxDurationMinutes),
    45,
  );
  const secondary = buildLaneSchedule(
    campaign.id,
    'compliance',
    campaign.window.toUtc,
    normalize(campaign.profile.maxDurationMinutes) * 0.8,
    60,
  );
  return mergeSchedules(base, secondary);
};

const initialState = (campaign: PlaybookLabCampaignPlan, runId: PlaybookLabRunId): PlaybookLabExecutionState => ({
  runId,
  campaignId: campaign.id,
  status: 'pending',
  selectedCandidate: undefined,
  candidates: campaign.candidates,
  telemetry: [],
  startedAt: undefined,
  completedAt: undefined,
});

const applyCommandResult = (state: PlaybookLabExecutionState, status: PlaybookLabExecutionState['status']): PlaybookLabExecutionState => ({
  ...state,
  status,
});

export interface ExecuteCommandInput {
  readonly campaign: PlaybookLabCampaignPlan;
  readonly command: 'execute' | 'pause' | 'resume' | 'refresh';
  readonly runId: PlaybookLabRunId;
}

export const scheduleRunBatch = (
  campaign: PlaybookLabCampaignPlan,
  command: ExecuteCommandInput,
): Result<readonly PlaybookLabExecutionState[], string> => {
  const schedule = buildCampaignSchedule(campaign);
  const signals = buildSignalBatch(String(campaign.tenantId), campaign.id, command.runId, schedule.length);
  if (campaign.candidates.length === 0) return fail('campaign-empty');
  if (schedule.length === 0) return fail('invalid-command');

  const runId = withBrand(`${command.runId}:scheduled`, 'PlaybookLabRunId');
  const state = initialState(campaign, runId);
  const updated = schedule.reduce((acc, scheduleItem) => {
    const executed = applyCommandResult(state, command.command === 'pause' ? 'paused' : 'running');
    const telemetryPoint = signals[acc.length % signals.length];
    if (!telemetryPoint) return acc;

    return [
      ...acc,
      {
        ...executed,
        telemetry: [
          ...executed.telemetry,
          {
            runId,
            at: scheduleItem.runAt,
            campaignId: campaign.id,
            score: telemetryPoint.score,
            latencyBudgetMs: telemetryPoint.latencyBudgetMs + scheduleItem.expectedDurationMinutes * 7,
            lane: scheduleItem.lane,
            isDryRun: telemetryPoint.isDryRun,
          },
        ],
      },
    ];
  }, [] as PlaybookLabExecutionState[]);

  return ok(updated);
};
