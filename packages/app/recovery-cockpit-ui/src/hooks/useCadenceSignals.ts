import { useMemo } from 'react';
import type { CadencePlanCandidate, CadenceRunPlan } from '@domain/recovery-operations-cadence';
import { buildExecutionReport, pickTopConstraintSignals, toCadenceWorkloadVector } from '@domain/recovery-operations-cadence';

type ConstraintSignal = {
  readonly key: string;
  readonly count: number;
};

export type CadenceSignalsState = {
  readonly signalDensity: number;
  readonly candidateConstraintSignals: readonly ConstraintSignal[];
  readonly topConstraintsCount: number;
  readonly candidateWithMostSlots?: CadencePlanCandidate;
  readonly planDensityById: ReadonlyMap<string, number>;
  readonly selectedPlanDensity: number;
};

const deriveSignalDensity = (plans: readonly CadenceRunPlan[]): number => {
  const values = plans.map((plan) => plan.slots.length / Math.max(1, plan.windows.length));
  return values.length === 0 ? 0 : values.reduce((acc, value) => acc + value, 0) / values.length;
};

const collectConstraintSignals = (candidates: readonly CadencePlanCandidate[]): ConstraintSignal[] => {
  const map = new Map<string, number>();
  for (const candidate of candidates) {
    for (const constraint of candidate.constraints) {
      const key = constraint.key;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
  }
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count);
};

export const useCadenceSignals = ({
  candidates,
  plans,
  selectedPlanId,
}: {
  readonly candidates: readonly CadencePlanCandidate[];
  readonly plans: readonly CadenceRunPlan[];
  readonly selectedPlanId?: string;
}) => {
  const planDensityById = useMemo(() => {
    const map = new Map<string, number>();
    for (const plan of plans) {
      map.set(plan.id, toCadenceWorkloadVector(plan).concurrentPeak);
    }
    return map;
  }, [plans]);

  const candidateConstraintSignals = useMemo(() => collectConstraintSignals(candidates), [candidates]);

  const candidateWithMostSlots = useMemo(
    () => candidates.reduce<CadencePlanCandidate | undefined>((acc, candidate) => {
      if (!acc) return candidate;
      return candidate.profile.slots.length > acc.profile.slots.length ? candidate : acc;
    }, undefined),
    [candidates],
  );

  const signalDensity = useMemo(() => deriveSignalDensity(plans), [plans]);

  const topConstraintsCount = useMemo(() => pickTopConstraintSignals(candidates).length, [candidates]);

  const selectedPlanDensity = useMemo(() => {
    const selected = plans.find((plan) => plan.id === selectedPlanId) ?? plans[0];
    if (!selected) return 0;
    const summary = buildExecutionReport(selected);
    return summary.scorecard.density;
  }, [plans, selectedPlanId]);

  const dashboardLines = useMemo(() => {
    const density = signalDensity.toFixed(3);
    const selected = candidates.length > 0 ? candidates[0].profile.source : 'planner';
    return [`cadence-density:${density}`, `source:${selected}`, `constraints:${topConstraintsCount}`, `plans:${plans.length}`];
  }, [candidates, plans, signalDensity, topConstraintsCount]);

  return {
    signalDensity,
    candidateConstraintSignals,
    topConstraintsCount,
    candidateWithMostSlots,
    planDensityById,
    selectedPlanDensity,
    dashboardLines,
  } as CadenceSignalsState & {
    readonly dashboardLines: readonly string[];
  };
};
