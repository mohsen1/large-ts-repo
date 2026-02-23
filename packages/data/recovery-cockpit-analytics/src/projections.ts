import { Result, fail, ok } from '@shared/result';
import { RecoveryPlan, CommandEvent, ReadinessEnvelope, PlanId } from '@domain/recovery-cockpit-models';
import { buildReadinessProfile, mergeProfiles, ServiceReadinessProfile } from '@domain/recovery-cockpit-workloads';
import { buildPlanForecast } from '@domain/recovery-cockpit-intelligence';
import { InMemoryCockpitStore } from '@data/recovery-cockpit-store';
import { buildPolicySignature, PlanPolicySignature } from '@domain/recovery-cockpit-workloads';
import { eventToDensity, PlanAnalyticsRow, CockpitTelemetryEnvelope, classifyHealth } from './schema';
import { AnalyticsQuery } from './schema';

export type CockpitMetricPoint = {
  readonly planId: string;
  readonly at: string;
  readonly readiness: number;
  readonly policyScore: number;
  readonly risk: number;
};

export const buildReadinessEnvelope = (plan: RecoveryPlan): ReadinessEnvelope => {
  const readiness = buildReadinessProfile(plan);
  return {
    planId: plan.planId,
    namespace: plan.labels.short,
    baselineScore: readiness.mean,
    windows: readiness.windows.map((window) => ({
      at: window.at,
      score: window.score,
      services: plan.actions.map((action) => action.serviceCode),
      expectedRecoveryMinutes: Math.round(plan.slaMinutes / Math.max(1, plan.actions.length)),
    })),
  };
};

export const mergeReadinessFromProfiles = (profiles: readonly ServiceReadinessProfile[]): ReadinessEnvelope => {
  const merged = mergeProfiles(profiles);
  const baseline = merged.length === 0 ? 0 : merged[0]?.mean ?? 0;
  const windows = merged.flatMap((item) => item.windows);
  return {
    planId: (profiles[0]?.planId ?? ('none' as PlanId)),
    namespace: profiles[0]?.namespace ?? 'none',
    baselineScore: baseline,
    windows: windows
      .map((window) => ({
        at: window.at,
        score: window.score,
        services: [],
        expectedRecoveryMinutes: Math.round((window.score / 10) + 5),
      }))
      .sort((left, right) => Number(new Date(left.at)) - Number(new Date(right.at))),
  };
};

export const projectPlanAnalytics = (
  plan: RecoveryPlan,
  events: readonly CommandEvent[],
): PlanAnalyticsRow => {
  const policy: PlanPolicySignature = buildPolicySignature(plan);
  const forecast = buildPlanForecast(plan, plan.mode === 'automated' ? 'aggressive' : 'balanced');
  const readiness = buildReadinessProfile(plan);
  const eventsDensity = eventToDensity(events);
  const risk = Number((forecast.summary + policy.overallScore + readiness.mean - events.length * 2).toFixed(2));

  return {
    planId: plan.planId,
    policy,
    readinessScore: readiness.mean,
    signalDensity: {
      ...eventsDensity,
      notice: eventsDensity.notice,
      critical: eventsDensity.critical,
      info: eventsDensity.info,
      warning: eventsDensity.warning,
    },
    eventsCount: events.length,
    risk,
    at: new Date().toISOString() as any,
  };
};

const riskScore = (row: PlanAnalyticsRow): number => {
  if (row.risk < 0) return 0;
  if (row.risk > 100) return 100;
  return row.risk;
};

export const buildMetricLine = (rows: readonly PlanAnalyticsRow[]): CockpitMetricPoint[] => {
  return rows
    .map((row) => ({
      planId: row.planId,
      at: row.at,
      readiness: row.readinessScore,
      policyScore: row.policy.overallScore,
      risk: riskScore(row),
    }))
    .sort((left, right) => Number(new Date(left.at)) - Number(new Date(right.at)));
};

export const buildTelemetryEnvelope = async (
  store: InMemoryCockpitStore,
  plan: RecoveryPlan,
): Promise<Result<CockpitTelemetryEnvelope, string>> => {
  const readiness = buildReadinessProfile(plan);
  const planRuns = await store.listRuns(plan.planId);
  if (!planRuns.ok) {
    return fail(planRuns.error);
  }

  const events = await store.getEvents(plan.planId, 100);
  return ok({
    planId: plan.planId,
    readiness: {
      planId: plan.planId,
      namespace: plan.labels.short,
      baselineScore: readiness.mean,
      windows: readiness.windows.map((window) => ({
        at: window.at,
        score: window.score,
        services: plan.actions.map((action) => action.serviceCode),
        expectedRecoveryMinutes: Math.round((window.score / 10) + 5),
      })),
    },
    healthClass: classifyHealth(readiness.mean),
    window: 'now',
    generatedAt: new Date().toISOString() as any,
  });
};

export const filterRows = (rows: readonly PlanAnalyticsRow[], query: AnalyticsQuery = {}): ReadonlyArray<PlanAnalyticsRow> => {
  const startAfter = query.atAfter ? new Date(query.atAfter).getTime() : undefined;
  const minRisk = query.minRisk ?? 0;
  const window = query.window ?? 'now';

  return rows.filter((row) => {
    if (query.minRisk !== undefined && row.risk < minRisk) {
      return false;
    }
    if (startAfter !== undefined && new Date(row.at).getTime() < startAfter) {
      return false;
    }
    if (window === 'now') {
      return true;
    }
    if (window === 'forecast') {
      return row.readinessScore > 60;
    }
    return row.risk >= minRisk;
  });
};
