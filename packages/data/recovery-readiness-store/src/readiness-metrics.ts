import type { ReadinessSignal, RecoveryReadinessPlan, ReadinessRunId } from '@domain/recovery-readiness';
import type { ReadinessReadModel } from './models';

export interface ReadinessMetricPoint {
  runId: ReadinessRunId;
  recordedAt: string;
  value: number;
  label: string;
}

export interface ReadinessModelMetrics {
  runId: ReadinessRunId;
  signalVolume: number;
  uniqueTargets: number;
  uniqueDirectives: number;
  averageSignalRisk: number;
  directiveDensity: number;
  planMaturity: 'draft' | 'approved' | 'active' | 'suppressed' | 'complete' | 'failed';
  riskMomentum: 'up' | 'flat' | 'down';
}

export interface ReadinessSignalsAggregate {
  runId: ReadinessRunId;
  totalsBySeverity: Record<ReadinessSignal['severity'], number>;
  totalsBySource: Record<ReadinessSignal['source'], number>;
  hourlyBuckets: Record<string, number>;
  topTargets: ReadonlyArray<{ targetId: string; score: number }>;
}

const severityOrder: ReadonlyArray<ReadinessSignal['severity']> = ['low', 'medium', 'high', 'critical'];

const sourceOrder: ReadonlyArray<ReadinessSignal['source']> = ['telemetry', 'manual-check', 'synthetic'];

const defaultSeverityTotals = () =>
  severityOrder.reduce((acc, key) => ({ ...acc, [key]: 0 }), {} as Record<ReadinessSignal['severity'], number>);

const defaultSourceTotals = () =>
  sourceOrder.reduce((acc, key) => ({ ...acc, [key]: 0 }), {} as Record<ReadinessSignal['source'], number>);

const riskScore = (signal: ReadinessSignal): number => {
  switch (signal.severity) {
    case 'low':
      return 1;
    case 'medium':
      return 4;
    case 'high':
      return 8;
    case 'critical':
      return 20;
  }
};

export const toSignalsAggregate = (signals: readonly ReadinessSignal[]): ReadinessSignalsAggregate => {
  const totalsBySeverity = defaultSeverityTotals();
  const totalsBySource = defaultSourceTotals();
  const hourlyBuckets: Record<string, number> = {};
  const targetAccumulator = new Map<string, number>();

  for (const signal of signals) {
    totalsBySeverity[signal.severity] += 1;
    totalsBySource[signal.source] += 1;
    const hour = new Date(signal.capturedAt).toISOString().slice(0, 13);
    hourlyBuckets[hour] = (hourlyBuckets[hour] ?? 0) + 1;

    const current = targetAccumulator.get(signal.targetId) ?? 0;
    targetAccumulator.set(signal.targetId, current + riskScore(signal));
  }

  const topTargets = Array.from(targetAccumulator.entries())
    .map(([targetId, score]) => ({ targetId, score: Number(score.toFixed(2)) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 10);

  return {
    runId: signals[0]?.runId ?? ('unknown' as ReadinessRunId),
    totalsBySeverity,
    totalsBySource,
    hourlyBuckets,
    topTargets,
  };
};

export const buildModelMetrics = (model: ReadinessReadModel): ReadinessModelMetrics => {
  const signalVolume = model.signals.length;
  const uniqueTargets = new Set(model.signals.map((signal) => signal.targetId)).size;
  const uniqueDirectives = model.directives.length;
  const averageSignalRisk =
    signalVolume === 0
      ? 0
      : model.signals.reduce((sum, signal) => sum + riskScore(signal), 0) / signalVolume;
  const directiveDensity = uniqueDirectives / Math.max(model.targets.length, 1);
  const highSignals = model.signals.filter((signal) => signal.severity === 'high' || signal.severity === 'critical').length;
  const riskMomentum: ReadinessModelMetrics['riskMomentum'] = highSignals > 4 ? 'up' : highSignals > 0 ? 'flat' : 'down';

  return {
    runId: model.plan.runId,
    signalVolume,
    uniqueTargets,
    uniqueDirectives,
    averageSignalRisk: Number(averageSignalRisk.toFixed(2)),
    directiveDensity: Number(directiveDensity.toFixed(2)),
    planMaturity: model.plan.state,
    riskMomentum,
  };
};

export const computeRiskSeries = (plan: RecoveryReadinessPlan): ReadinessMetricPoint[] => {
  const series: ReadinessMetricPoint[] = [];
  const base = new Date(plan.createdAt).getTime();

  for (let step = 0; step < Math.max(plan.windows.length, 1); step += 1) {
    const offset = step * 60_000;
    const value =
      (step + 1) * (plan.windows.length + plan.targets.length) * (plan.targets.length + 1);
    const recordedAt = new Date(base + offset).toISOString();
    series.push({
      runId: plan.runId,
      recordedAt,
      value: Number(value.toFixed(2)),
      label: `window-${step + 1}`,
    });
  }

  return series;
};
