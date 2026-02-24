import { useCallback, useEffect, useMemo, useState } from 'react';
import { InMemoryCockpitStore } from '@data/recovery-cockpit-store';
import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { buildBatchScenarioSummary, pickReadyScenarios } from '@service/recovery-cockpit-orchestrator';
import { buildScenarioSummary } from '@service/recovery-cockpit-orchestrator';

export type ScenarioOrchestrationHookState = {
  readonly loading: boolean;
  readonly plans: readonly RecoveryPlan[];
  readonly pinned: ReadonlyArray<RecoveryPlan['planId']>;
  readonly summariesReady: boolean;
  readonly errors: ReadonlyArray<string>;
};

const emptyState = (plans: readonly RecoveryPlan[]): ScenarioOrchestrationHookState => ({
  loading: false,
  plans,
  pinned: [],
  summariesReady: false,
  errors: [],
});

export const useScenarioOrchestration = (store: InMemoryCockpitStore) => {
  const [state, setState] = useState<ScenarioOrchestrationHookState>(emptyState([]));

  const refresh = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, errors: [] }));
    const plansResult = await store.listPlans();
    if (!plansResult.ok) {
      setState((current) => ({ ...current, loading: false, errors: [plansResult.error] }));
      return;
    }

    const plans = plansResult.value;
    const summaryResult = await buildBatchScenarioSummary(store, plans);
    if (!summaryResult.ok) {
      setState((current) => ({ ...current, loading: false, plans, errors: [summaryResult.error] }));
      return;
    }

    setState((current) => ({
      ...current,
      loading: false,
      plans,
      summariesReady: summaryResult.value.length > 0,
      errors: [],
    }));
  }, [store]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const readyPlans = useMemo(() => pickReadyScenarios(state.plans), [state.plans]);

  const togglePin = useCallback(async (plan: RecoveryPlan) => {
    const planId = plan.planId;
    setState((current) => {
      const isPinned = current.pinned.includes(planId);
      const pinned = isPinned ? current.pinned.filter((item) => item !== planId) : [...current.pinned, planId];
      return { ...current, pinned };
    });
    await buildScenarioSummary(store, plan);
  }, [store]);

  return useMemo(() => ({
    ...state,
    refresh,
    readyPlans,
    togglePin,
  }), [refresh, readyPlans, state, togglePin]);
};
