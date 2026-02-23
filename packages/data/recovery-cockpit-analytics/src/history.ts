import { PlanId, RecoveryPlan, CommandEvent, ReadinessWindow } from '@domain/recovery-cockpit-models';
import { InMemoryCockpitStore } from '@data/recovery-cockpit-store';
import { buildTelemetryEnvelope, buildReadinessEnvelope, filterRows } from './projections';
import { Result, ok, fail } from '@shared/result';
import { PlanAnalyticsRow, AnalyticsQuery, AnalyticsDigest, CockpitTelemetryEnvelope } from './schema';

export type AnalyticsHistory = {
  readonly planId: PlanId;
  readonly snapshots: ReadonlyArray<PlanAnalyticsRow>;
  readonly trend: ReadonlyArray<{ at: string; score: number }>;
};

export const collectAnalyticsHistory = async (
  store: InMemoryCockpitStore,
  plans: readonly RecoveryPlan[],
): Promise<AnalyticsHistory> => {
  const snapshots: PlanAnalyticsRow[] = [];
  for (const plan of plans) {
    const events = await store.getEvents(plan.planId, 250);
    const envelope = await buildTelemetryEnvelope(store, plan);
    if (!envelope.ok) {
      continue;
    }

    const readiness = buildReadinessEnvelope(plan);
    snapshots.push({
      planId: plan.planId,
      policy: {
        planId: plan.planId,
        overallScore: readiness.baselineScore,
        factors: [
          {
            dimension: 'sloImpact',
            score: readiness.baselineScore,
            rationale: 'runtime computed',
            suggestions: ['collect additional signals'],
          },
        ],
        riskClassification: envelope.value.healthClass === 'stable' ? 'green' : envelope.value.healthClass === 'degraded' ? 'yellow' : 'red',
        generatedAt: Date.now(),
      },
      readinessScore: readiness.baselineScore,
      signalDensity: {
        critical: 0,
        warning: events.filter((event) => event.status === 'failed' || event.status === 'cancelled').length,
        notice: events.filter((event) => event.status === 'queued').length,
        info: events.filter((event) => event.status === 'completed').length,
      },
      eventsCount: events.length,
      risk: Math.max(0, 100 - events.length),
      at: new Date().toISOString() as any,
    });
  }
  const trend = snapshots.map((snapshot) => ({
    at: snapshot.at,
    score: snapshot.readinessScore,
  }));

  return {
    planId: (plans[0]?.planId ?? ('none' as PlanId)),
    snapshots,
    trend,
  };
};

export const buildDigest = (
  rows: readonly PlanAnalyticsRow[],
  query: AnalyticsQuery = {},
): Result<AnalyticsDigest, string> => {
  const filtered = filterRows(rows, query);
  if (filtered.length === 0) {
    return fail('analytics-empty');
  }
  const latest = filtered[filtered.length - 1];
  const healthTrend = latest.risk - (filtered[0]?.risk ?? latest.risk);
  return ok({
    runId: `${Date.now()}`,
    rows: filtered,
    updatedAt: new Date().toISOString() as any,
    healthTrend,
  });
};

export const streamTelemetryForPlan = async (
  store: InMemoryCockpitStore,
  plan: RecoveryPlan,
): Promise<Iterable<CockpitTelemetryEnvelope>> => {
  const snapshots = await collectAnalyticsHistory(store, [plan]);
  return snapshots.snapshots.map((snapshot) => ({
    planId: snapshot.planId,
    readiness: {
      planId: snapshot.planId,
      namespace: plan.labels.short,
      baselineScore: snapshot.readinessScore,
      windows: [] as readonly ReadinessWindow[],
    },
    healthClass: snapshot.risk > 80 ? 'stable' : snapshot.risk > 40 ? 'degraded' : 'critical',
    window: 'now',
    generatedAt: new Date().toISOString() as any,
  }));
};
