import { Result, fail, ok } from '@shared/result';
import { RecoveryPlan, PlanId } from '@domain/recovery-cockpit-models';
import { InMemoryCockpitStore } from '@data/recovery-cockpit-store';
import { summarizeScenarioRuns, buildScenarioEnvelope } from '@domain/recovery-cockpit-orchestration-core';
import { collectPlanSloSignals, summarizeSloSignals } from '@data/recovery-cockpit-store';

export type SignalBoard = Readonly<{
  readonly planId: PlanId;
  readonly ready: boolean;
  readonly runState: string;
  readonly recommendation: string;
  readonly sloSummary: string;
}>;

export const evaluateSignalBoard = async (
  store: InMemoryCockpitStore,
  plans: readonly RecoveryPlan[],
): Promise<Result<ReadonlyArray<SignalBoard>, string>> => {
  const states = summarizeScenarioRuns(plans);
  const out: SignalBoard[] = [];

  for (const plan of plans) {
    const state = states.find((item) => item.planId === plan.planId);
    const topologyEnvelope = buildScenarioEnvelope(plan);
    const criticalWarnings = topologyEnvelope.state.policyRecommendations;

    const sloSignals = await collectPlanSloSignals(store, plan.planId);
    const summary = sloSignals.ok ? summarizeSloSignals(sloSignals.value) : 'slo unavailable';

    if (!state) {
      return fail(`state-missing:${plan.planId}`);
    }

    const top = criticalWarnings.length > 0 ? criticalWarnings.at(-1) : 'all-clear';
    out.push({
      planId: plan.planId,
      ready: state.policyAllowed,
      runState: state.state,
      recommendation: top ?? 'all-clear',
      sloSummary: summary,
    });
  }

  return ok(out);
};

export const criticalSignalHeat = (boards: readonly SignalBoard[]): number => {
  if (boards.length === 0) return 0;
  const blocked = boards.filter((board) => !board.ready).length;
  return Math.round((blocked / boards.length) * 100);
};
