import type { DrillCandidate, DrillMode, DrillTemplate, RecoveryDrillTenantId } from './types';

export interface CandidateInput {
  template: DrillTemplate;
  tenantId: RecoveryDrillTenantId;
}

export interface CandidateFilters {
  minScore: number;
  tenantId?: RecoveryDrillTenantId;
  allowedModes?: readonly DrillMode[];
}

const priorityWeight = (priority: DrillTemplate['priority']): number => {
  if (priority === 'critical') return 100;
  if (priority === 'platinum') return 75;
  if (priority === 'gold') return 50;
  if (priority === 'silver') return 25;
  return 12;
};

export const selectCandidates = (items: readonly CandidateInput[], filters: CandidateFilters): readonly DrillCandidate[] => {
  return items
    .filter((item) => (filters.tenantId ? item.tenantId === filters.tenantId : true))
    .filter((item) => (filters.allowedModes ? filters.allowedModes.includes(item.template.mode) : true))
    .map((item) => {
      const score = priorityWeight(item.template.priority) + item.template.scenarios.length;
      const reasons = [
        `priority:${item.template.priority}`,
        `scenarios:${item.template.scenarios.length}`,
        `mode:${item.template.mode}`,
      ];
      return { templateId: item.template.id, score, reasons } as DrillCandidate;
    })
    .filter((candidate) => candidate.score >= filters.minScore)
    .sort((a, b) => b.score - a.score);
};

export const summarizeSelection = (
  candidates: readonly DrillCandidate[],
): { selectedCount: number; topScore: number; total: number } => ({
  selectedCount: candidates.length,
  topScore: candidates.reduce((acc, candidate) => Math.max(acc, candidate.score), 0),
  total: candidates.length,
});
