import { useMemo } from 'react';
import type { StrategyTemplate, StrategyPhase, StrategyStepNode } from '@domain/recovery-orchestration-planning';

export interface StrategyPlannerSummary {
  readonly totalTargets: number;
  readonly criticalityAvg: number;
  readonly phaseDistribution: Record<StrategyPhase, number>;
  readonly canRunInParallel: boolean;
  readonly orderedSteps: readonly StrategyStepNode[];
}

export const useStrategyPlanner = (template: StrategyTemplate): StrategyPlannerSummary => {
  const phaseDistribution = useMemo<Record<StrategyPhase, number>>(
    () =>
      template.steps.reduce<Record<StrategyPhase, number>>(
        (acc, step) => {
          acc[step.phase] += 1;
          return acc;
        },
        {
          inbound: 0,
          simulation: 0,
          release: 0,
          validation: 0,
          postmortem: 0,
        },
      ),
    [template.steps],
  );

  const criticalityAvg = useMemo(() => {
    const values = template.targets.map((target) => target.criticality);
    if (values.length === 0) {
      return 0;
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }, [template.targets]);

  const orderedSteps = useMemo(
    () => [...template.steps].sort((left, right) => left.stepId.localeCompare(right.stepId)),
    [template.steps],
  );

  const canRunInParallel = template.steps.every((step) => step.maxParallelism > 0);

  return {
    totalTargets: template.targets.length,
    criticalityAvg,
    phaseDistribution,
    canRunInParallel,
    orderedSteps,
  };
};
