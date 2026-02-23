import { UtcIsoTimestamp, ReadinessEnvelope, CommandEvent, PlanId } from '@domain/recovery-cockpit-models';
import { PlanPolicySignature } from '@domain/recovery-cockpit-workloads';

export type WindowKey = 'now' | 'shifted' | 'forecast';

export type SignalDensity = {
  readonly critical: number;
  readonly warning: number;
  readonly notice: number;
  readonly info: number;
};

export type CockpitTelemetryEnvelope = {
  readonly planId: PlanId;
  readonly readiness: ReadinessEnvelope;
  readonly healthClass: 'stable' | 'degraded' | 'critical';
  readonly window: WindowKey;
  readonly generatedAt: UtcIsoTimestamp;
};

export type PlanAnalyticsRow = {
  readonly planId: PlanId;
  readonly policy: PlanPolicySignature;
  readonly readinessScore: number;
  readonly signalDensity: SignalDensity;
  readonly eventsCount: number;
  readonly risk: number;
  readonly at: UtcIsoTimestamp;
};

export type AnalyticsDigest = {
  readonly runId: string;
  readonly rows: ReadonlyArray<PlanAnalyticsRow>;
  readonly updatedAt: UtcIsoTimestamp;
  readonly healthTrend: number;
};

export type AnalyticsQuery = {
  readonly atAfter?: UtcIsoTimestamp;
  readonly minRisk?: number;
  readonly window?: WindowKey;
};

export const classifyHealth = (score: number): 'stable' | 'degraded' | 'critical' => {
  if (score >= 80) return 'stable';
  if (score >= 50) return 'degraded';
  return 'critical';
};

export const emptyDensity: SignalDensity = {
  critical: 0,
  warning: 0,
  notice: 0,
  info: 0,
};

export const eventToDensity = (events: readonly CommandEvent[]): SignalDensity => {
  const density: {
    critical: number;
    warning: number;
    notice: number;
    info: number;
  } = {
    ...emptyDensity,
  };
  for (const event of events) {
    if (event.status === 'failed' || event.status === 'cancelled') {
      density.warning += 1;
      continue;
    }
    if (event.status === 'completed') {
      density.info += 1;
      continue;
    }
    density.notice += 1;
  }
  return density;
};

export type HealthTrendPoint = {
  readonly at: UtcIsoTimestamp;
  readonly score: number;
  readonly planId: PlanId;
  readonly risk: number;
};

export const toHealthTrend = (rows: readonly PlanAnalyticsRow[]): readonly HealthTrendPoint[] =>
  rows
    .map((row) => ({
      at: row.at,
      score: row.readinessScore,
      planId: row.planId,
      risk: row.risk,
    }))
    .sort((left, right) => Number(new Date(left.at)) - Number(new Date(right.at)));
