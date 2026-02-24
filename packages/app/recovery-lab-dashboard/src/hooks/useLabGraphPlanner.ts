import { useMemo } from 'react';
import type { GraphStep } from '@domain/recovery-lab-synthetic-orchestration';

type PlannerFilter = {
  readonly namespace?: string;
  readonly intensity?: 'calm' | 'elevated' | 'extreme';
  readonly pluginPrefix?: string;
};

export interface PlanSlice {
  readonly id: string;
  readonly phase: string;
  readonly plugin: string;
  readonly estimatedMs: number;
}

export const useLabGraphPlanner = ({
  namespace,
  steps,
  filter,
}: {
  namespace: string;
  steps: readonly GraphStep<string>[];
  filter?: PlannerFilter;
}) => {
  const filteredSteps = useMemo(() => {
    const namespacePrefix = namespace.startsWith('tenant') ? namespace : `tenant/${namespace}`;
    return steps
      .filter((step) => step.phase.includes(namespacePrefix))
      .filter((step) => (filter?.pluginPrefix ? step.plugin.startsWith(filter.pluginPrefix) : true))
      .filter((step) => (filter?.intensity ? step.intensity === filter.intensity : true))
      .toSorted((left, right) => left.estimatedMs - right.estimatedMs);
  }, [steps, namespace, filter]);

  const phaseGroups = useMemo(
    () =>
      filteredSteps.reduce<Record<string, PlanSlice[]>>((acc, step) => {
        const current = acc[step.phase] ?? [];
        acc[step.phase] = [
          ...current,
          {
            id: step.id,
            phase: step.phase,
            plugin: step.plugin,
            estimatedMs: step.estimatedMs,
          },
        ];
        return acc;
      }, {}),
    [filteredSteps],
  );

  const countsByIntensity = useMemo(
    () =>
      filteredSteps.reduce<Record<string, number>>(
        (acc, step) => ({
          ...acc,
          [step.intensity]: (acc[step.intensity] ?? 0) + 1,
        }),
        {},
      ),
    [filteredSteps],
  );

  const projectedRuntime = useMemo(
    () => filteredSteps.reduce((total, step) => total + step.estimatedMs, 0),
    [filteredSteps],
  );

  const criticalPath = useMemo(
    () =>
      filteredSteps
        .filter((step) => step.intensity === 'extreme')
        .map((step) => step.id),
    [filteredSteps],
  );

  return {
    all: filteredSteps,
    phaseGroups,
    countsByIntensity,
    projectedRuntime,
    criticalPath,
    isEmpty: filteredSteps.length === 0,
  };
};
