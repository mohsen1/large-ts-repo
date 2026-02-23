import { useEffect, useMemo, useState } from 'react';
import {
  previewCampaignTelemetry,
  runLabCommand,
} from '@service/recovery-playbook-lab-orchestrator';
import { bootstrapPlaybookLab, refineByCommandHistory, selectCandidateByIntent } from '@service/recovery-playbook-lab-orchestrator';
import { rankPlaybookCandidates } from '@domain/recovery-playbook-lab';
import type {
  PlaybookLabWorkspaceInput,
  PlaybookLabWorkspaceContext,
  PlaybookRunCommand,
} from '@service/recovery-playbook-lab-orchestrator';
import type { PlaybookLabCampaignPlan } from '@domain/recovery-playbook-lab';
import type { RecoveryPlaybookRepository } from '@data/recovery-playbook-store';
import type { RecoveryPlaybookQuery } from '@domain/recovery-playbooks';
import type { CandidateRow, PlaybookLabRouteState, TelemetryRow } from '../types';
import { withBrand } from '@shared/core';

interface Options {
  readonly repository: RecoveryPlaybookRepository;
  readonly input: PlaybookLabWorkspaceInput;
}

interface Output {
  readonly state: {
    readonly route: PlaybookLabRouteState;
    readonly context: PlaybookLabWorkspaceContext | undefined;
    readonly candidates: readonly CandidateRow[];
    readonly telemetry: readonly TelemetryRow[];
    readonly scheduleCount: number;
  };
  readonly refresh: () => Promise<void>;
  readonly runPlan: (id: string) => Promise<void>;
  readonly toggleLens: (lens: PlaybookLabRouteState['lens']) => void;
  readonly statusSummary: string;
}

const toRows = (campaign: PlaybookLabCampaignPlan): readonly CandidateRow[] =>
  campaign.candidates.map((candidate) => ({
    id: candidate.playbook.id,
    title: candidate.playbook.title,
    score: candidate.riskEnvelope.score,
    timeMinutes: candidate.estimatedRecoveryTimeMinutes,
    confidence: candidate.forecastConfidence,
    status: candidate.constraintsSatisfied ? 'eligible' : 'blocked',
    lane: candidate.lane,
  }));

const toTelemetryRows = (state: ReturnType<typeof previewCampaignTelemetry>): readonly TelemetryRow[] => {
  return [{
    runId: state.campaignId,
    at: new Date().toISOString(),
    score: state.forecast,
    lane: Object.keys(state.scoreByLane)[0] ?? 'recovery',
    latencyMs: state.telemetryCount * 120,
    dryRun: true,
  }];
};

export const useRecoveryPlaybookLabWorkspace = ({ repository, input }: Options): Output => {
  const [workspace, setWorkspace] = useState<PlaybookLabWorkspaceContext | undefined>(undefined);
  const [campaign, setCampaign] = useState<PlaybookLabCampaignPlan | undefined>(undefined);
  const [route, setRoute] = useState<PlaybookLabRouteState>({
    tenant: input.tenantId,
    lens: input.lens,
  });
  const [telemetryRows, setTelemetryRows] = useState<readonly TelemetryRow[]>([]);
  const profileVersion = `v${Math.max(1, input.maxDurationMinutes > 0 ? 1 : 0)}` as const;

  const queryPlaybooks = useMemo<RecoveryPlaybookQuery>(() => ({
    tenantId: input.tenantId,
    status: 'published',
    labels: [route.lens],
    limit: input.maxCandidates,
    ...(input.searchQuery ?? {}),
  }), [input, route.lens]);

  const refresh = async () => {
    const workspaceResult = await bootstrapPlaybookLab({
      ...input,
      lens: route.lens,
      searchQuery: queryPlaybooks,
    }, repository);
    if (!workspaceResult.ok) {
      setWorkspace(undefined);
      setCampaign(undefined);
      setTelemetryRows([
        {
          runId: 'no-run',
          at: new Date().toISOString(),
          score: 0,
          lane: route.lens,
          latencyMs: 0,
          dryRun: false,
        },
  ]);
      return;
    }
    setWorkspace(workspaceResult.value);

    const candidates = await repository.query({
      tenantId: workspaceResult.value.tenantId,
      status: 'published',
      labels: [route.lens],
      limit: input.maxCandidates,
    });
    if (!candidates.ok) {
      setCampaign(undefined);
      setTelemetryRows([]);
      return;
    }
    const ranked = rankPlaybookCandidates(
      candidates.value.items.map((item) => item.playbook),
      route.lens,
      workspaceResult.value.campaignId,
    );
    const fakeCampaign = {
      id: workspaceResult.value.campaignId,
      tenantId: workspaceResult.value.tenantId,
      name: 'Recovery Playbook Lab',
      owner: workspaceResult.value.statusReason,
      lens: route.lens,
      status: workspaceResult.value.status,
      window: workspaceResult.value.window,
      candidates: ranked,
      signals: [],
      profile: {
        version: profileVersion,
        requestedBy: workspaceResult.value.profile.requestedBy,
        allowedStatus: workspaceResult.value.profile.allowedStatus,
        maxDurationMinutes: workspaceResult.value.profile.maxDurationMinutes,
        maxSteps: workspaceResult.value.profile.allowedStatus.length,
      },
    } satisfies PlaybookLabCampaignPlan;
    setCampaign(fakeCampaign);
    setTelemetryRows([
      {
        runId: fakeCampaign.id,
        at: new Date().toISOString(),
        score: ranked.reduce((acc, item) => acc + item.forecastConfidence, 0),
        lane: route.lens,
        latencyMs: ranked.length * 95,
        dryRun: true,
      },
    ]);
  };

  useEffect(() => {
    void refresh();
  }, [route.lens]);

  const runPlan = async (playbookId: string) => {
    if (!campaign) return;
    const chosen = campaign.candidates.find((candidate) => candidate.playbook.id === playbookId)
      ?? campaign.candidates[0];
    if (!chosen) return;

    const command: PlaybookRunCommand = {
      runId: withBrand(`run:${campaign.id}:${Date.now()}`, 'PlaybookLabRunId'),
      candidate: chosen,
      command: 'execute',
      requestedBy: route.tenant,
    };
    const result = await runLabCommand(command, campaign, ['manual-trigger']);
    if (!result.ok) {
      setTelemetryRows((previous) => [
        ...previous,
        {
          runId: command.runId,
          at: new Date().toISOString(),
          score: -1,
          lane: route.lens,
          latencyMs: 0,
          dryRun: false,
        },
      ]);
      return;
    }
    setCampaign((current) => {
      if (!current) return current;
      const prioritized = selectCandidateByIntent(current, chosen.playbook.id);
      return refineByCommandHistory(prioritized, [playbookId], 4);
    });
    setTelemetryRows((current) => [
      ...current,
      ...toTelemetryRows(previewCampaignTelemetry(result.value.telemetry.state)),
    ]);
  };

  return {
    state: {
      route,
      context: workspace,
      candidates: campaign ? toRows(campaign) : [],
      telemetry: telemetryRows,
      scheduleCount: campaign?.candidates.length ?? 0,
    },
    refresh,
    runPlan,
    toggleLens: (nextLens) => setRoute((current) => ({ ...current, lens: nextLens })),
    statusSummary: workspace ? `${workspace.status} | ${workspace.profile.maxSteps} steps | window=${workspace.window.timezone}` : 'not-initialized',
  };
};
