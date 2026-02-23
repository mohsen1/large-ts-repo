import type { StoredOutcomeRecord } from './types';
import { canPublish } from '@domain/recovery-playbook-orchestration';

export interface WorkspaceHealthTrend {
  readonly workspaceId: string;
  readonly totalRuns: number;
  readonly successRate: number;
  readonly publishRate: number;
  readonly averageDurationMinutes: number;
}

export const buildTrend = (workspaceId: string, outcomes: readonly StoredOutcomeRecord[]): WorkspaceHealthTrend => {
  if (outcomes.length === 0) {
    return {
      workspaceId,
      totalRuns: 0,
      successRate: 0,
      publishRate: 0,
      averageDurationMinutes: 0,
    };
  }

  const successCount = outcomes.reduce((acc, outcome) => (outcome.outcome.success ? acc + 1 : acc), 0);
  const publishCount = outcomes.reduce((acc, outcome) => (canPublish(outcome.outcome) ? acc + 1 : acc), 0);
  const totalDuration = outcomes.reduce((acc, outcome) => acc + outcome.outcome.durationMinutes, 0);

  return {
    workspaceId,
    totalRuns: outcomes.length,
    successRate: successCount / outcomes.length,
    publishRate: publishCount / outcomes.length,
    averageDurationMinutes: totalDuration / outcomes.length,
  };
};

export const groupByPolicyBand = (outcomes: readonly StoredOutcomeRecord[]): Record<string, number> => {
  return outcomes.reduce(
    (acc, item) => {
      acc[item.outcome.finalBand] = (acc[item.outcome.finalBand] ?? 0) + 1;
      return acc;
    },
    { red: 0, amber: 0, green: 0 } as Record<string, number>,
  );
};
