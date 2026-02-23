import { RecoveryPlan, UtcIsoTimestamp } from '@domain/recovery-cockpit-models';
import { buildPlanForecast } from '@domain/recovery-cockpit-intelligence';
import { buildReadinessProfile } from '@domain/recovery-cockpit-workloads';
import { buildCapacityPlan } from '@domain/recovery-cockpit-workloads';
import { PlanAnalyticsRow } from './schema';
import { buildPolicySignature, PlanPolicySignature } from '@domain/recovery-cockpit-workloads';
import { InMemoryCockpitStore } from '@data/recovery-cockpit-store';

export type AnalyticsMode = 'predictive' | 'diagnostic' | 'forensic';

export type PipelineStage = {
  readonly at: string;
  readonly kind: AnalyticsMode;
  readonly details: string;
};

export type AnalyticsRowEnvelope = {
  readonly plan: RecoveryPlan;
  readonly row: PlanAnalyticsRow;
  readonly stages: readonly PipelineStage[];
  readonly confidence: number;
};

const buildPolicy = (plan: RecoveryPlan): PlanPolicySignature => {
  const signature = buildPolicySignature(plan);
  return {
    ...signature,
  };
};

const readinessScore = (plan: RecoveryPlan): number => {
  const profile = buildReadinessProfile(plan);
  return profile.mean;
};

const forecastRisk = (plan: RecoveryPlan): number => {
  const forecast = buildPlanForecast(plan, plan.mode === 'automated' ? 'aggressive' : 'balanced');
  return forecast.summary;
};

const capacityScore = (plan: RecoveryPlan): number => {
  const capacity = buildCapacityPlan(plan);
  return capacity.score;
};

const signalDensity = (events: readonly { status: 'queued' | 'active' | 'completed' | 'failed' | 'cancelled' | 'idle' }[]) => {
  const baseline = {
    critical: 0,
    warning: 0,
    notice: 0,
    info: 0,
  };
  for (const event of events) {
    if (event.status === 'failed' || event.status === 'cancelled') {
      baseline.warning += 1;
      continue;
    }
    if (event.status === 'completed') {
      baseline.info += 1;
      continue;
    }
    baseline.notice += 1;
  }

  return baseline;
};

const stage = (kind: AnalyticsMode, plan: RecoveryPlan, value: number): PipelineStage => ({
  at: new Date().toISOString(),
  kind,
  details: `${plan.planId}:${kind}:${value.toFixed(2)}`,
});

const confidence = (row: PlanAnalyticsRow): number => {
  const penalty = Math.min(20, Math.max(0, row.eventsCount / 5));
  return Number(Math.max(0, 100 - penalty).toFixed(2));
};

export const buildAnalyticsEnvelope = async (store: InMemoryCockpitStore, plans: readonly RecoveryPlan[]): Promise<readonly AnalyticsRowEnvelope[]> => {
  const envelopes: AnalyticsRowEnvelope[] = [];
  for (const plan of plans) {
    const policy = buildPolicy(plan);
    const readiness = readinessScore(plan);
    const forecast = forecastRisk(plan);
    const capacity = capacityScore(plan);

    const events = await store.getEvents(plan.planId, 250);
    const density = signalDensity(events);

    const risk = Number((forecast + (100 - readiness) + (100 - capacity) + (density.warning * 1.8) - (policy.overallScore * 0.2)).toFixed(2));
    const row: PlanAnalyticsRow = {
      planId: plan.planId,
      policy,
      readinessScore: readiness,
      signalDensity: density,
      eventsCount: events.length,
      risk,
      at: new Date().toISOString() as UtcIsoTimestamp,
    };

    const stages: PipelineStage[] = [
      stage('diagnostic', plan, readiness),
      stage('predictive', plan, forecast),
      stage('forensic', plan, capacity),
    ];

    envelopes.push({
      plan,
      row,
      stages,
      confidence: confidence(row),
    });
  }

  return envelopes;
};

export const rankEnvelopeByRisk = (envelopes: readonly AnalyticsRowEnvelope[]): readonly AnalyticsRowEnvelope[] =>
  [...envelopes].sort((left, right) => right.row.risk - left.row.risk);

export const mapEnvelopeToRow = (envelope: AnalyticsRowEnvelope): PlanAnalyticsRow => envelope.row;

export const summarizeEnvelope = (envelope: AnalyticsRowEnvelope): string =>
  `${envelope.plan.planId} risk=${envelope.row.risk} confidence=${envelope.confidence} stages=${envelope.stages.length}`;
