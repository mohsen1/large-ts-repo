import { InMemoryCockpitStore } from '@data/recovery-cockpit-store';
import { InMemoryCockpitInsightsStore } from './inMemoryInsightsStore';
import { CockpitInsight } from './insightModels';
import { buildRiskForecast } from '@domain/recovery-cockpit-intelligence';
import { buildReadinessProfile } from '@domain/recovery-cockpit-workloads';
import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { listInsights, InsightQuery } from './queryEngine';

export type InsightFacade = {
  readonly insightsStore: InMemoryCockpitInsightsStore;
  readonly planStore: InMemoryCockpitStore;
  refreshInsights(): Promise<readonly CockpitInsight[]>;
  reportSnapshot(): Promise<{ lines: number; risks: number }>;
  describePlan(plan: RecoveryPlan): Promise<string>;
};

export const createInsightFacade = (planStore: InMemoryCockpitStore, insightsStore: InMemoryCockpitInsightsStore): InsightFacade => {
  const refreshInsights = async (query: InsightQuery = {}): Promise<readonly CockpitInsight[]> => {
    const list = await listInsights(planStore, query);
    for (const entry of list) {
      await insightsStore.upsertInsight(entry.insight);
    }
    return list;
  };

  const reportSnapshot = async (): Promise<{ lines: number; risks: number }> => {
    const list = await refreshInsights();
    const summaries = list.map((entry) => {
      const readiness = buildReadinessProfile(entry.plan);
      const forecast = buildRiskForecast(entry.plan, 'advisory', entry.signals);
      return {
        planId: entry.plan.planId,
        readiness: readiness.mean,
        forecast: forecast.summary.overallRisk,
      };
    });

    const riskCount = summaries.filter((entry) => entry.forecast > 70 || entry.readiness < 60).length;
    return {
      lines: summaries.length,
      risks: riskCount,
    };
  };

  const describePlan = async (plan: RecoveryPlan): Promise<string> => {
    const forecast = buildRiskForecast(plan, 'advisory');
    const profile = buildReadinessProfile(plan);
    return [
      `${plan.labels.short} readiness=${profile.mean.toFixed(2)}`,
      `forecast=${forecast.summary.overallRisk.toFixed(2)}`,
      `criticalWindows=${forecast.peakRisk.toFixed(2)}`,
      `riskCells=${forecast.windows.length}`,
    ].join(' | ');
  };

  return {
    insightsStore,
    planStore,
    refreshInsights: () => refreshInsights(),
    reportSnapshot,
    describePlan,
  };
};
