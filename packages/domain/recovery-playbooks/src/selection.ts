import type { RecoveryPlaybook, RecoveryPlaybookQuery, RecoveryPlanExecution, RecoveryPlaybookId, RecoveryStepId, RecoveryPlanId, PlaybookSelectionPolicy } from './models';

export interface RankedPlaybook {
  playbook: RecoveryPlaybook;
  score: number;
  rationale: readonly string[];
}

const hasAnyMatchingLabel = (
  playbookLabels: readonly string[],
  required: readonly string[],
): boolean => required.every((label) => playbookLabels.includes(label));

const isAllowedByStatus = (
  playbookStatus: RecoveryPlaybook['status'],
  policy: PlaybookSelectionPolicy,
): boolean => policy.allowedStatuses.includes(playbookStatus);

const isWindowOpen = (playbook: RecoveryPlaybook, now = new Date()): boolean => {
  if (playbook.windows.length === 0) return true;
  const hour = now.getUTCHours();
  return playbook.windows.some((window) => {
    if (window.fromHour <= window.toHour) {
      return hour >= window.fromHour && hour <= window.toHour;
    }
    return hour >= window.fromHour || hour <= window.toHour;
  });
};

const scoreLabels = (playbook: RecoveryPlaybook, policy: PlaybookSelectionPolicy): number =>
  hasAnyMatchingLabel(playbook.labels, policy.requiredLabels) ? 2 : 0;

const scoreSeverity = (playbook: RecoveryPlaybook): number =>
  playbook.severityBands.includes('p0') ? 5 : playbook.severityBands.includes('p1') ? 3 : 1;

const scoreSteps = (playbook: RecoveryPlaybook): number =>
  Math.min(playbook.steps.length, 20) * 0.4;

export const rankPlaybooks = (
  playbooks: readonly RecoveryPlaybook[],
  policy: PlaybookSelectionPolicy,
): RankedPlaybook[] => {
  const now = new Date();
  return playbooks
    .filter((playbook) => isAllowedByStatus(playbook.status, policy))
    .filter((playbook) => isWindowOpen(playbook, now))
    .filter((playbook) => !playbook.windows.some((window) => policy.forbiddenChannels.includes(window.channel)))
    .map((playbook) => {
      const rationale: string[] = [];
      const labelScore = scoreLabels(playbook, policy);
      const severityScore = scoreSeverity(playbook);
      const stepScore = scoreSteps(playbook);
      const score = labelScore + severityScore + stepScore;
      if (labelScore > 0) rationale.push('required-label coverage');
      if (severityScore >= 5) rationale.push('critical-severity coverage');
      if (stepScore > 0) rationale.push('operational playbook size available');
      return { playbook, score, rationale };
    })
    .sort((a, b) => b.score - a.score || b.playbook.version.localeCompare(a.playbook.version));
};

export const pickTopSteps = (
  ranked: readonly RankedPlaybook[],
  policy: PlaybookSelectionPolicy,
  max: number,
): RankedPlaybook[] => ranked.slice(0, Math.min(max, policy.maxStepsPerRun));

export const buildExecution = (
  planId: RecoveryPlaybookId,
  runId: string,
  ranked: readonly RankedPlaybook[],
): RecoveryPlanExecution => {
  const allStepIds = ranked.flatMap((item) => item.playbook.steps.map((step) => step.id));
  const planExecutionId = `${planId}:${runId}` as RecoveryPlanId;
  return {
    id: planExecutionId,
    runId: runId as RecoveryPlanExecution['runId'],
    playbookId: planId,
    status: 'pending',
    selectedStepIds: [...new Set(allStepIds)].slice(0, 20) as readonly RecoveryStepId[],
    telemetry: {
      attempts: 0,
      failures: 0,
      recoveredStepIds: [],
    },
    operator: 'system',
  };
};

export const matchesQuery = (candidate: RecoveryPlaybook, query: RecoveryPlaybookQuery): boolean => {
  if (query.status && candidate.status !== query.status) return false;
  if (query.categories?.length && !query.categories.includes(candidate.category)) return false;
  if (query.labels?.length && !query.labels.every((label) => candidate.labels.includes(label))) return false;
  if (query.severityBands?.length && !candidate.severityBands.some((band) => query.severityBands?.includes(band))) return false;
  return true;
};
