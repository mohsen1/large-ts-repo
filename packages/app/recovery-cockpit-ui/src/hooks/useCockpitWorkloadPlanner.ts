import { useMemo, useState } from 'react';
import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { summarizeWorkloadReadiness, estimateCapacityUtilization, findBottleneck } from '@service/recovery-cockpit-orchestrator';

export type WorkloadPlan = {
  readonly planId: string;
  readonly ready: boolean;
  readonly slotCount: number;
  readonly forecastWindows: number;
  readonly readinessScore: number;
  readonly bottleneck: readonly string[];
  readonly capacity: readonly { actionId: string; predictedFinish: string }[];
};

export const useCockpitWorkloadPlanner = (plans: readonly RecoveryPlan[]) => {
  const [selected, setSelected] = useState('');
  const [active, setActive] = useState<string[]>([]);

  const summaries = useMemo(
    () =>
      plans.map((plan) => {
        const summary = summarizeWorkloadReadiness(plan);
        return {
          planId: plan.planId,
          ready: summary.gateOk,
          slotCount: summary.slotCount,
          forecastWindows: summary.forecastWindows,
          readinessScore: summary.readinessScore,
          bottleneck: findBottleneck(plan).slice(0, 3),
          capacity: estimateCapacityUtilization(plan),
        } as const;
      }),
    [plans],
  );

  const top = summaries
    .slice()
    .sort((left, right) => (right.readinessScore - left.readinessScore));

  const activeSummary = summaries.find((entry) => entry.planId === selected) ?? summaries[0] ?? null;

  const toggleAction = (planId: string) => {
    setActive((current) => {
      if (current.includes(planId)) {
        return current.filter((entry) => entry !== planId);
      }
      return [...current, planId];
    });
  };

  return {
    selected,
    setSelected,
    active,
    top,
    toggleAction,
    activeSummary,
  };
};
