import { RecoveryOpsOrchestrationStore } from '@data/recovery-ops-orchestration-store';
import type { CommandOrchestrationResult } from '@domain/recovery-ops-orchestration-surface';

export interface RiskBreakdown {
  readonly low: number;
  readonly medium: number;
  readonly high: number;
  readonly critical: number;
}

export interface EngineInsights {
  readonly scoreTrend: readonly number[];
  readonly blockersTrend: readonly number[];
  readonly lastPlanSummary: string;
  readonly riskMix: RiskBreakdown;
}

export const buildRiskBreakdown = (result: CommandOrchestrationResult): RiskBreakdown => {
  const buckets: { low: number; medium: number; high: number; critical: number } = { low: 0, medium: 0, high: 0, critical: 0 };
  const risk = result.surface.availablePlans.find((plan) => plan.id === result.chosenPlanId)?.riskLevel;

  if (risk) {
    buckets[risk] = 1;
  }

  return buckets;
};

export const buildInsights = (store: RecoveryOpsOrchestrationStore): EngineInsights => {
  const snapshot = store.snapshot();
  const recent = store.searchRuns({
    limit: 20,
  });

  const scoreTrend = recent.data.map((entry) => entry.result.score);
  const blockersTrend = recent.data.map((entry) => entry.result.blockers.length);
  const last = recent.data[0];

  const riskMix: { low: number; medium: number; high: number; critical: number } = { low: 0, medium: 0, high: 0, critical: 0 };

  for (const record of recent.data) {
    const chosen = record.result.surface.availablePlans.find((candidate) => candidate.id === record.result.chosenPlanId);
    if (chosen) {
      riskMix[chosen.riskLevel] += 1;
    }
  }

  return {
    scoreTrend,
    blockersTrend,
    lastPlanSummary: last ? `${last.planId} ${last.result.ok ? 'ok' : 'blocked'}` : 'none',
    riskMix,
  };
};

export const summarizeHistory = (result: CommandOrchestrationResult): string => {
  const success = result.ok ? 'allowed' : 'blocked';
  const blockers = result.blockers.join('|');
  return `selection:${success} score=${result.score} risk=${result.riskScore} blockers=${blockers}`;
};
