import { useMemo } from 'react';
import { PlanHealthSummary } from '@data/recovery-cockpit-store';
import { PlanId } from '@domain/recovery-cockpit-models';

export type ReadinessNarrative = {
  readonly planId: PlanId;
  readonly title: string;
  readonly trend: PlanHealthSummary['trend'];
  readonly score: number;
  readonly risk: 'low' | 'medium' | 'high';
  readonly readinessWindow: {
    readonly green: number;
    readonly yellow: number;
    readonly red: number;
  };
};

const riskFromSummary = (summary: PlanHealthSummary): ReadinessNarrative['risk'] => {
  const score = summary.latestReadiness;
  if (score >= 80) return 'low';
  if (score >= 60) return 'medium';
  return 'high';
};

export const useReadinessNarrative = (
  summaries: Readonly<Record<string, PlanHealthSummary>>,
): readonly ReadinessNarrative[] => {
  return useMemo(
    () =>
      Object.entries(summaries)
        .filter((entry): entry is [string, PlanHealthSummary] => entry[1] !== undefined)
        .map(([planId, summary]) => {
          return {
            planId: planId as PlanId,
            title: `Plan ${planId}`,
            trend: summary.trend,
            score: summary.latestReadiness,
            risk: riskFromSummary(summary),
            readinessWindow: {
              green: summary.riskBands.green,
              yellow: summary.riskBands.yellow,
              red: summary.riskBands.red,
            },
          };
        }),
    [summaries],
  );
};
