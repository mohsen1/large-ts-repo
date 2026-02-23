import { PlanId, CockpitSignal, RecoveryPlan, RuntimeRun } from '@domain/recovery-cockpit-models';
import { InMemoryCockpitStore } from '@data/recovery-cockpit-store';
import { toCockpitSignalDigest, projectInsight } from './projections';
import { CockpitInsight, PlanHealth, PlanInsight } from './insightModels';
import { buildReadinessProjection, buildPlanForecast } from '@domain/recovery-cockpit-intelligence';

export type InsightQuery = {
  readonly planId?: PlanId;
  readonly health?: PlanHealth;
  readonly minRisk?: number;
  readonly minReadiness?: number;
  readonly hasSignals?: boolean;
};

export type PlanInsightRecord = {
  readonly plan: RecoveryPlan;
  readonly forecastSummary: number;
  readonly readinessTail: number;
  readonly health: PlanHealth;
  readonly insight: PlanInsight;
  readonly signalDigest: string;
  readonly signalCount: number;
  readonly readinessProjectionPoints: number;
};

const projectRecord = (
  plan: RecoveryPlan,
  forecastSummary: number,
  signals: readonly CockpitSignal[],
  runs: readonly RuntimeRun[],
): PlanInsightRecord => {
  const readiness = buildReadinessProjection(plan, plan.mode === 'automated' ? 'automated' : 'manual');
  const insight = projectInsight({
    plan,
    runs,
    signals,
    forecastSummary,
  });

  const health = insight.score.health;
  const digest = toCockpitSignalDigest(signals);
  const signalCount = signals.length;
  return {
    plan,
    forecastSummary,
    readinessTail: readiness.at(-1)?.value ?? 0,
    health,
    insight,
    signalDigest: `${digest.activeCount}/${digest.criticalCount}/${digest.mutedCount}`,
    signalCount,
    readinessProjectionPoints: readiness.length,
  };
};

export const listInsights = async (store: InMemoryCockpitStore, query: InsightQuery = {}): Promise<readonly CockpitInsight[]> => {
  const allPlans = await store.listPlans({});
  if (!allPlans.ok) {
    return [];
  }

  const result: CockpitInsight[] = [];
  for (const plan of allPlans.value) {
    if (query.planId && query.planId !== plan.planId) {
      continue;
    }

    const runRows = await store.listRuns(plan.planId);
    if (!runRows.ok) {
      continue;
    }

    const signalRows = await store.getEvents(plan.planId, 250);
    const forecast = buildPlanForecast(plan, 'balanced');
    const record = projectRecord(plan, forecast.summary, signalRows, runRows.value);

    if (query.health && query.health !== record.health) {
      continue;
    }
    if (query.minRisk !== undefined && record.insight.score.risk < query.minRisk) {
      continue;
    }
    if (query.minReadiness !== undefined && record.insight.score.readiness < query.minReadiness) {
      continue;
    }
    if (query.hasSignals && record.signalCount === 0) {
      continue;
    }

    result.push({
      plan,
      insight: record.insight,
      forecast: record.forecastSummary,
      signals: signalRows,
    });
  }

  return result;
};

export const groupByHealth = (insights: readonly CockpitInsight[]): Record<PlanHealth, readonly CockpitInsight[]> => {
  const grouped: Record<PlanHealth, CockpitInsight[]> = {
    green: [],
    yellow: [],
    red: [],
  };

  for (const entry of insights) {
    grouped[entry.insight.score.health].push(entry);
  }

  return grouped;
};

export const summarizeRecords = (insights: readonly PlanInsightRecord[]) => {
  const totalSignals = insights.reduce((acc, insight) => acc + Number(insight.signalDigest.split('/')[0]), 0);
  const critical = insights.filter((insight) => insight.health === 'red').length;
  return {
    count: insights.length,
    critical,
    avgReadiness: insights.length === 0 ? 0 : Number((insights.reduce((acc, item) => acc + item.readinessTail, 0) / insights.length).toFixed(2)),
    totalSignals,
  };
};

export const mergeSignalDigests = (signals: readonly string[]): string =>
  [...new Set(signals)].sort().join('|');
