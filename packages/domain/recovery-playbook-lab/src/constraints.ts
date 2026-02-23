import type {
  CampaignLane,
  PlaybookLabCandidate,
  LabConstraintWindow,
  PlaybookLabCampaignPlan,
} from './types';

const isWithinWindow = (window: LabConstraintWindow, instant: number): boolean => {
  const start = Date.parse(window.fromUtc);
  const end = Date.parse(window.toUtc);
  return Number.isFinite(start) && Number.isFinite(end) && instant >= start && instant <= end;
};

const isLaneAllowed = (candidate: PlaybookLabCandidate, lane: CampaignLane): boolean => {
  if (lane === 'compliance') {
    return candidate.playbook.labels.includes('compliance') || candidate.playbook.labels.includes('audit');
  }
  if (lane === 'performance') {
    return candidate.playbook.steps.every((step) => step.type !== 'manual');
  }
  if (lane === 'stability') {
    return candidate.reasons.includes('published') || candidate.riskEnvelope.score >= 30;
  }
  return candidate.estimatedRecoveryTimeMinutes <= 180 && candidate.forecastConfidence >= 35;
}

const filterByQuery = (candidate: PlaybookLabCandidate): boolean => {
  if (candidate.query.status === undefined) return true;
  return candidate.query.status === candidate.playbook.status;
};

const ensureStepBudget = (candidate: PlaybookLabCandidate): boolean => candidate.playbook.steps.length <= 64;

export const selectByWindow = (
  candidates: readonly PlaybookLabCandidate[],
  campaign: Pick<PlaybookLabCampaignPlan, 'window' | 'lens'>,
  nowIso: string,
): readonly PlaybookLabCandidate[] => {
  const now = Date.parse(nowIso);
  return candidates
    .filter((candidate) => isWithinWindow(campaign.window, now))
    .filter((candidate) => isLaneAllowed(candidate, campaign.lens))
    .filter(filterByQuery)
    .filter((candidate) => candidate.riskEnvelope.budget >= 1)
    .filter(ensureStepBudget)
    .filter((candidate) => candidate.constraintsSatisfied);
};

export const pickTopConstraints = (
  candidates: readonly PlaybookLabCandidate[],
  campaign: Pick<PlaybookLabCampaignPlan, 'window' | 'lens' | 'profile'>,
  nowIso = new Date().toISOString(),
): readonly PlaybookLabCandidate[] => {
  const selectedByWindow = selectByWindow(candidates, campaign, nowIso);
  const scoreFloor = campaign.profile.maxDurationMinutes / 10;
  return selectedByWindow
    .filter((candidate) => candidate.estimatedRecoveryTimeMinutes <= scoreFloor * 10)
    .sort((left, right) => (
      right.forecastConfidence - left.forecastConfidence || right.riskEnvelope.score - left.riskEnvelope.score
    ))
    .slice(0, campaign.profile.maxSteps);
};
