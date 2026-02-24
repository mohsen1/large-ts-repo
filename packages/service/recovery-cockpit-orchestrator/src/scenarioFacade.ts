import { Result, fail, ok } from '@shared/result';
import { RecoveryPlan, RecoveryAction } from '@domain/recovery-cockpit-models';
import { buildScenarioEnvelope, summarizeScenarioRuns } from '@domain/recovery-cockpit-orchestration-core';
import { InMemoryCockpitStore, upsertScenarioCache, findCachedCriticalNodeIds } from '@data/recovery-cockpit-store';
import { summarizeTempo, forecastExecutionTempo } from '@domain/recovery-cockpit-orchestration-core';

export type ScenarioFacadeSummary = {
  readonly planId: string;
  readonly actionCount: number;
  readonly state: string;
  readonly policyAllowed: boolean;
  readonly canRun: boolean;
  readonly criticalCount: number;
  readonly tempo: ReturnType<typeof forecastExecutionTempo>;
  readonly summary: string;
};

const extractCritical = (plan: RecoveryPlan, criticalIds: readonly string[]): ReadonlyArray<RecoveryAction> => {
  const lookup = new Set(criticalIds);
  return plan.actions.filter((action) => lookup.has(action.id));
};

export const buildScenarioSummary = async (
  store: InMemoryCockpitStore,
  plan: RecoveryPlan,
): Promise<Result<ScenarioFacadeSummary, string>> => {
  const cacheResult = await upsertScenarioCache(store, plan.planId);
  if (!cacheResult.ok) {
    return fail(cacheResult.error);
  }
  const criticalNodes = await findCachedCriticalNodeIds(store, plan.planId);
  if (!criticalNodes.ok) {
    return fail(criticalNodes.error);
  }

  const states = summarizeScenarioRuns([plan]);
  const state = states[0];
  if (!state) {
    return fail('scenario-state-missing');
  }

  const critical = extractCritical(plan, criticalNodes.value);
  const tempo = forecastExecutionTempo(plan);
  const summary = summarizeTempo(tempo);

  return ok({
    planId: plan.planId,
    actionCount: plan.actions.length,
    state: state.state,
    policyAllowed: state.policyAllowed,
    canRun: state.policyAllowed && state.readinessScore > 40 && critical.length <= state.riskScore + 20,
    criticalCount: critical.length,
    tempo,
    summary,
  });
};

export const buildBatchScenarioSummary = async (
  store: InMemoryCockpitStore,
  plans: readonly RecoveryPlan[],
): Promise<Result<ReadonlyArray<ScenarioFacadeSummary>, string>> => {
  const summaries: ScenarioFacadeSummary[] = [];
  for (const plan of plans) {
    const summary = await buildScenarioSummary(store, plan);
    if (!summary.ok) {
      return fail(summary.error);
    }
    summaries.push(summary.value);
  }
  return ok(summaries);
};

export const pickReadyScenarios = (plans: readonly RecoveryPlan[]): readonly RecoveryPlan[] => {
  const states = summarizeScenarioRuns(plans);
  const ready = new Map<string, string>(states.filter((state) => state.state === 'ready' || state.state === 'queued').map((state) => [state.planId, state.state]));
  return plans.filter((plan) => ready.has(plan.planId));
};
