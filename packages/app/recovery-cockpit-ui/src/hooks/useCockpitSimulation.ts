import { useCallback, useEffect, useMemo, useState } from 'react';
import { RecoveryPlan, RecoveryAction } from '@domain/recovery-cockpit-models';
import { buildReadinessProjection } from '@domain/recovery-cockpit-intelligence';
import { simulatePlan, SimulationReport } from '@service/recovery-cockpit-orchestrator';
import { sortPlansByReadiness, toHeatLevel } from '@data/recovery-cockpit-store';

export type SimulationInput = {
  readonly plans: readonly RecoveryPlan[];
};

export type SimulationOutput = {
  readonly ready: boolean;
  readonly projections: ReadonlyArray<{ planId: string; windows: ReadonlyArray<{ at: Date; value: number }> }>;
  readonly simulations: ReadonlyArray<{ planId: string; report: SimulationReport; actions: readonly string[] }>;
  readonly summaries: ReadonlyArray<{ planId: string; heat: ReturnType<typeof toHeatLevel>; score: number }>;
  refresh(): void;
};

const summarizeReadiness = (projections: readonly { value: number }[]): number =>
  projections.reduce((acc, projection) => acc + projection.value, 0) / Math.max(1, projections.length);

const actionFingerprint = (plan: RecoveryPlan): readonly string[] =>
  plan.actions.map((action: RecoveryAction) => `${action.id}:${action.command}`);

export const useCockpitSimulation = ({ plans }: SimulationInput): SimulationOutput => {
  const [ready, setReady] = useState(false);
  const [projections, setProjections] = useState<SimulationOutput['projections']>([]);
  const [simulations, setSimulations] = useState<SimulationOutput['simulations']>([]);
  const [summaries, setSummaries] = useState<SimulationOutput['summaries']>([]);

  const sorted = useMemo(() => sortPlansByReadiness([...plans]), [plans]);

  const recompute = useCallback(() => {
    const nextProjections = sorted.map((plan) => {
      const windows = buildReadinessProjection(plan, 'automated');
      return {
        planId: plan.planId,
        windows,
      };
    });
    setProjections(nextProjections);

    const nextSimulations = sorted.map((plan) => {
      const report = simulatePlan(plan);
      return {
        planId: plan.planId,
        report,
        actions: actionFingerprint(plan),
      };
    });
    setSimulations(nextSimulations);

    const nextSummaries = nextSimulations.map((entry) => {
      const score = summarizeReadiness(nextProjections.find((projection) => projection.planId === entry.planId)?.windows ?? []);
      const heat = toHeatLevel(Math.max(0, 100 - score));
      return {
        planId: entry.planId,
        heat,
        score: Number(score.toFixed(2)),
      };
    });
    setSummaries(nextSummaries);
    setReady(true);
  }, [sorted]);

  useEffect(() => {
    recompute();
  }, [recompute]);

  return {
    ready,
    projections,
    simulations,
    summaries,
    refresh: recompute,
  };
};
