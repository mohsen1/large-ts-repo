import type { Brand } from '@shared/core';
import { withBrand } from '@shared/core';
import type { RecoverySignal, RunSession, RunPlanSnapshot } from './types';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';
import { buildCommandIntentMatrix } from './command-intent';

export type PortfolioBucket = Brand<string, 'PortfolioBucket'>;
export type TrendDirection = 'up' | 'down' | 'flat';

export interface SignalBucket {
  readonly key: PortfolioBucket;
  readonly source: string;
  readonly count: number;
  readonly averageSeverity: number;
  readonly averageConfidence: number;
  readonly topSignalIds: readonly string[];
}

export interface PortfolioSignalForecast {
  readonly tenant: string;
  readonly windowMinutes: number;
  readonly bucket: SignalBucket;
  readonly projectedBursts: readonly number[];
  readonly trend: TrendDirection;
  readonly directionScore: number;
}

export interface PortfolioForecast {
  readonly tenant: string;
  readonly runId: string;
  readonly planId: string;
  readonly generatedAt: string;
  readonly forecasts: readonly PortfolioSignalForecast[];
  readonly confidence: number;
  readonly actionCount: number;
}

const toBucket = (source: string, signals: readonly RecoverySignal[]): SignalBucket => {
  const sorted = [...signals].sort((left, right) => right.severity - left.severity);
  const count = sorted.length;
  const totalSeverity = sorted.reduce((sum, item) => sum + item.severity, 0);
  const totalConfidence = sorted.reduce((sum, item) => sum + item.confidence, 0);

  return {
    key: withBrand(`bucket:${source}`, 'PortfolioBucket'),
    source,
    count,
    averageSeverity: Number((count ? totalSeverity / count : 0).toFixed(2)),
    averageConfidence: Number((count ? totalConfidence / count : 0).toFixed(2)),
    topSignalIds: sorted.slice(0, 3).map((item) => item.id),
  };
};

const buildProjections = (base: number, trend: number): readonly number[] => {
  const points: number[] = [];
  let cursor = base;
  for (let index = 0; index < 6; index += 1) {
    cursor = Math.max(0, Number((cursor + trend * (index + 1)).toFixed(2)));
    points.push(cursor);
  }
  return points;
};

const estimateTrend = (samples: readonly number[]): TrendDirection => {
  if (samples.length < 2) {
    return 'flat';
  }
  const start = samples[0] ?? 0;
  const end = samples[samples.length - 1] ?? 0;
  if (end > start + 1) return 'up';
  if (end < start - 1) return 'down';
  return 'flat';
};

export const buildPortfolioForecast = (
  session: RunSession,
  snapshot: RunPlanSnapshot,
  readinessPlan: RecoveryReadinessPlan,
): PortfolioForecast => {
  const groupedBySource = new Map<string, RecoverySignal[]>();
  for (const signal of session.signals) {
    const bucket = groupedBySource.get(signal.source) ?? [];
    bucket.push(signal);
    groupedBySource.set(signal.source, bucket);
  }

  const intentMatrix = buildCommandIntentMatrix(session, snapshot, readinessPlan);
  const forecasts: PortfolioSignalForecast[] = [];

  for (const [source, signals] of groupedBySource) {
    const bucket = toBucket(source, signals);
    const baseSignalLoad = bucket.averageSeverity * bucket.averageConfidence;
    const projectedBursts = buildProjections(baseSignalLoad, bucket.averageSeverity - 3);
    const directionScore = projectedBursts[projectedBursts.length - 1] - projectedBursts[0];

    forecasts.push({
      tenant: snapshot.fingerprint.tenant,
      windowMinutes: readinessPlan.windows?.[0]?.toUtc
        ? Math.max(5, Number(new Date(readinessPlan.windows[0].toUtc).getTime() - Date.now()) / (60_000))
        : 30,
      bucket,
      projectedBursts,
      trend: estimateTrend(projectedBursts),
      directionScore,
    });
  }

  const confidence = Math.max(0, Math.min(1, intentMatrix.aggregateScore));

  return {
    tenant: snapshot.fingerprint.tenant,
    runId: String(session.runId),
    planId: String(snapshot.id),
    generatedAt: new Date().toISOString(),
    forecasts: forecasts.sort((left, right) => right.bucket.averageSeverity - left.bucket.averageSeverity),
    confidence,
    actionCount: intentMatrix.slots.reduce((acc, slot) => acc + slot.signalIds.length, 0),
  };
};

export const summarizePortfolioForecast = (forecast: PortfolioForecast): string => {
  const byTrend = forecast.forecasts.reduce<Record<TrendDirection, number>>(
    (acc, item) => {
      acc[item.trend] += 1;
      return acc;
    },
    { up: 0, down: 0, flat: 0 },
  );

  const top = forecast.forecasts
    .slice(0, 2)
    .map((entry) => `${entry.bucket.source}=${entry.trend}(${entry.directionScore.toFixed(2)})`)
    .join(', ');

  return `tenant=${forecast.tenant} forecasts=${forecast.forecasts.length} confidence=${forecast.confidence.toFixed(3)} ` +
    `up=${byTrend.up} flat=${byTrend.flat} down=${byTrend.down} top=[${top}]`;
};
