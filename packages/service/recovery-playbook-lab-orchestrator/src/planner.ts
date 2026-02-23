import { withBrand, normalizeLimit } from '@shared/core';
import { fail, ok, type Result } from '@shared/result';
import { rankPlaybookCandidates, pickTopConstraints } from '@domain/recovery-playbook-lab';
import type {
  CampaignLane,
  PlaybookLabCandidate,
  PlaybookLabCampaignPlan,
  PlaybookLabCampaignId,
  PlaybookLabProfileVersion,
} from '@domain/recovery-playbook-lab';
import type { RecoveryPlaybook, RecoveryPlaybookId } from '@domain/recovery-playbooks';
import type { PlaybookLabWorkspaceInput } from './types';

export interface PlannerConfig {
  readonly defaultCandidateLimit: number;
  readonly candidatePadding: number;
}

const buildCampaignId = (tenant: string, lens: CampaignLane): PlaybookLabCampaignId => {
  return withBrand(`${tenant}:${lens}:${Date.now()}`, 'PlaybookLabCampaignId');
};

const buildCandidates = (
  playbooks: readonly RecoveryPlaybook[],
  lens: CampaignLane,
  campaignId: PlaybookLabCampaignId,
): readonly PlaybookLabCandidate[] => rankPlaybookCandidates(playbooks, lens, campaignId);

const buildProfileVersion = (tenantId: string, lens: CampaignLane): PlaybookLabProfileVersion => {
  const hash = Math.abs((tenantId + lens).split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % 100);
  return `v${hash}` as PlaybookLabProfileVersion;
};

const isActivePlaybook = (playbook: RecoveryPlaybook): boolean =>
  playbook.status === 'published' || playbook.status === 'draft';

const pruneByTenant = (playbooks: readonly RecoveryPlaybook[], tenantId: string): readonly RecoveryPlaybook[] => {
  return playbooks.filter((playbook) => playbook.tags.tenant === tenantId || !playbook.tags.tenant);
};

export const buildWorkspacePlan = (
  input: PlaybookLabWorkspaceInput,
  playbooks: readonly RecoveryPlaybook[],
): Result<PlaybookLabCampaignPlan, string> => {
  const campaignId = buildCampaignId(input.tenantId, input.lens);
  const activePlaybooks = pruneByTenant(playbooks, input.tenantId).filter(isActivePlaybook);
  if (activePlaybooks.length === 0) {
    return fail('campaign-empty');
  }

  const candidates = buildCandidates(activePlaybooks, input.lens, campaignId);
  const topCandidates = pickTopConstraints(candidates, {
    window: input.window,
    lens: input.lens,
    profile: {
      requestedBy: input.owner,
      version: buildProfileVersion(input.tenantId, input.lens),
      allowedStatus: input.searchQuery?.status ? [input.searchQuery.status] : ['published'],
      maxDurationMinutes: input.maxDurationMinutes,
      maxSteps: normalizeLimit(input.maxCandidates),
    },
  });
  if (topCandidates.length === 0) {
    return fail('campaign-empty');
  }

  return ok({
    id: campaignId,
    tenantId: input.tenantId,
    name: `playbook-lab-${input.lens}-${input.tenantId}`,
    owner: input.owner,
    lens: input.lens,
    status: 'active',
    window: input.window,
    candidates: topCandidates,
    signals: [],
    profile: {
      requestedBy: input.owner,
      version: buildProfileVersion(input.tenantId, input.lens),
      allowedStatus: ['published', 'deprecated'],
      maxDurationMinutes: input.maxDurationMinutes,
      maxSteps: normalizeLimit(input.maxCandidates),
    },
  });
};

export const refineByCommandHistory = (
  campaign: PlaybookLabCampaignPlan,
  selectedIds: readonly string[],
  budget: number,
): PlaybookLabCampaignPlan => {
  const selected = new Set(selectedIds);
  const prioritized = campaign.candidates.filter((candidate) => selected.has(candidate.playbook.id))
    .concat(campaign.candidates.filter((candidate) => !selected.has(candidate.playbook.id)));
  const capped = prioritized.slice(0, Math.max(1, budget));
  return {
    ...campaign,
    candidates: capped,
  };
};

export const selectCandidateByIntent = (
  campaign: PlaybookLabCampaignPlan,
  preferredPlaybookId: RecoveryPlaybookId,
): PlaybookLabCampaignPlan => {
  const picked = campaign.candidates.find((candidate) => candidate.playbook.id === preferredPlaybookId);
  if (!picked) {
    return campaign;
  }
  const prioritized = [picked, ...campaign.candidates.filter((candidate) => candidate.playbook.id !== preferredPlaybookId)];
  return {
    ...campaign,
    candidates: prioritized,
  };
};
