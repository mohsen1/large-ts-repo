import { PlanId, RecoveryPlan, RuntimeRun, CockpitSignal } from '@domain/recovery-cockpit-models';
import { PlanInsight, PlanHealth, InsightsFilter } from './insightModels';
import { InMemoryCockpitInsightsStore } from './inMemoryInsightsStore';
import { buildCockpitInsight, projectInsight } from './projections';

export type CockpitInsightsFacade = {
  seed(plan: RecoveryPlan): Promise<void>;
  storeSignal(planId: PlanId, signal: CockpitSignal): Promise<void>;
  list(filter?: InsightsFilter): Promise<readonly PlanInsight[]>;
  snapshot(planId: PlanId): Promise<PlanInsight | undefined>;
};

export const createCockpitInsightsFacade = (store: InMemoryCockpitInsightsStore): CockpitInsightsFacade => ({
  async seed(plan) {
    const insight = buildCockpitInsight(plan, [], [], 0).insight;
    await store.upsertInsight(insight);
  },
  async storeSignal(planId, signal) {
    await store.appendSignals(planId, [signal]);
  },
  async list(filter) {
    return store.listInsights(filter);
  },
  async snapshot(planId) {
    return store.getInsight(planId);
  },
});

export const filterHealth = (insights: readonly PlanInsight[], health: PlanHealth): readonly PlanInsight[] =>
  insights.filter((insight) => insight.score.health === health);

export const hydrateInsight = (store: InMemoryCockpitInsightsStore, plan: RecoveryPlan, runs: readonly RuntimeRun[]): void => {
  const signals: readonly CockpitSignal[] = [];
  void projectInsight({
    plan,
    runs,
    signals,
    forecastSummary: 100 - runs.length,
  });
  void store.getInsight(plan.planId);
};
