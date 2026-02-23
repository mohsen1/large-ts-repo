import type { RecoveryPlanExecution, RecoveryPlaybook } from '@domain/recovery-playbooks';
import type { PlaybookLabCandidate, CampaignLane, PlaybookLabCampaignId } from './types';
import { withBrand } from '@shared/core';

const normalize = (value: number, max = 100): number => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > max) return max;
  return value;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const scoreComplexity = (playbook: RecoveryPlaybook): number => {
  const steps = Math.max(playbook.steps.length, 1);
  const avgRetries = playbook.steps.reduce((sum, step) => sum + step.retries, 0) / steps;
  const timeoutMean = playbook.steps.reduce((sum, step) => sum + step.timeoutMinutes, 0) / steps;
  const dependencyPressure = playbook.steps.reduce((sum, step) => sum + (step.dependencies.length * 2), 0) / (steps * 2);
  return normalize(100 - (avgRetries * 10) - (timeoutMean * 0.5) - dependencyPressure);
};

const scoreRisk = (playbook: RecoveryPlaybook): number => {
  const isCritical = playbook.severityBands.includes('p0') ? 55 : playbook.severityBands.includes('p1') ? 30 : 0;
  const automationRate = playbook.steps.filter((step) => step.type === 'automated').length / Math.max(playbook.steps.length, 1);
  const governanceBonus = playbook.labels.includes('compliance') ? 8 : 0;
  return isCritical + automationRate * 40 + governanceBonus;
};

const scoreFreshness = (playbook: RecoveryPlaybook): number => {
  const ageMins = Date.now() - Date.parse(playbook.updatedAt);
  const ageHours = ageMins / (1000 * 60 * 60);
  const decay = Math.max(0, 24 - Math.min(ageHours, 24));
  return decay;
};

const toCandidateId = (playbookId: string, lane: CampaignLane, index: number): string =>
  `${playbookId}:${lane}:${index}`;

const reasonsFromPlaybook = (playbook: RecoveryPlaybook, lane: CampaignLane): string[] => {
  const output: string[] = [];
  if (playbook.labels.includes('runbook')) {
    output.push('runbook-labeled');
  }
  if (playbook.status === 'published') {
    output.push('published');
  }
  if (lane === 'compliance' && playbook.labels.includes('governance')) {
    output.push('governance-aligned');
  }
  if (playbook.windows.length === 0) {
    output.push('always-available');
  }
  return output;
};

const buildPlanFromPlaybook = (playbook: RecoveryPlaybook, campaignId: string): RecoveryPlanExecution => {
  const ordered = [...playbook.steps].sort((a, b) => b.rank - a.rank);
  return {
    id: `${playbook.id}:run` as RecoveryPlanExecution['id'],
    runId: `run:${campaignId}:${playbook.id}` as RecoveryPlanExecution['runId'],
    playbookId: playbook.id,
    status: 'pending',
    selectedStepIds: ordered.slice(0, 12).map((step) => step.id),
    operator: campaignId,
    telemetry: {
      attempts: 0,
      failures: 0,
      recoveredStepIds: [],
    },
  };
};

export const rankPlaybookCandidates = (
  playbooks: readonly RecoveryPlaybook[],
  lane: CampaignLane,
  campaignId: string,
): readonly PlaybookLabCandidate[] => {
  const ordered = [...playbooks].sort((a, b) => a.title.localeCompare(b.title));
  return ordered.map((playbook, index) => {
    const complexity = scoreComplexity(playbook);
    const risk = scoreRisk(playbook);
    const freshness = scoreFreshness(playbook);
    const score = clamp01((complexity * 0.45 + risk * 0.4 + freshness * 0.15) / 100);
    const plan = buildPlanFromPlaybook(playbook, campaignId);

    return {
      playbook,
      query: {
        status: playbook.status,
        labels: [lane],
      },
      plan,
      riskEnvelope: {
        score: score * 100,
        budget: Math.max(1, Math.round((1 - score) * 100)),
        rationale: reasonsFromPlaybook(playbook, lane),
        signals: reasonsFromPlaybook(playbook, lane).map((rationale) => `${rationale}:${score.toFixed(2)}`),
      },
      estimatedRecoveryTimeMinutes: Math.max(1, Math.ceil(playbook.steps.length * 6 + freshness / 10)),
      forecastConfidence: Math.max(20, Math.round(score * 100)),
      constraintsSatisfied: lane !== 'compliance' || playbook.labels.includes('compliance'),
      campaign: withBrand(campaignId, 'PlaybookLabCampaignId'),
      lane,
      reasons: reasonsFromPlaybook(playbook, lane),
    };
  })
    .sort((left, right) => right.forecastConfidence - left.forecastConfidence)
    .map((candidate, index) => ({
      ...candidate,
      campaign: withBrand(`${candidate.campaign}:${index}`, 'PlaybookLabCampaignId'),
      forecastConfidence: candidate.forecastConfidence - (index * 0.5),
    }));
};
