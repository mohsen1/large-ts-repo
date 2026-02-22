import { weightedPercentile } from './utils';
import { parseBundle, parseForecast } from './schemas';
import type {
  RecoveryActionCandidate,
  RecoveryForecast,
  RecoveryRecommendation,
  RecoverySignal,
  RecoverySignalBundle,
} from './types';
import { bucketPriority, normalizeSeverity } from './utils';

export interface SignalGrouping {
  readonly category: RecoverySignal['category'];
  readonly averageSeverity: number;
  readonly count: number;
  readonly latestObservedAt: RecoverySignal['observedAt'];
}

export interface PipelineMetrics {
  readonly tenantId: RecoverySignalBundle['context']['tenantId'];
  readonly totalSignals: number;
  readonly activeSignalRate: number;
  readonly grouped: readonly SignalGrouping[];
  readonly rolling95thPercentile: number;
}

export const groupByCategory = (signals: readonly RecoverySignal[]): readonly SignalGrouping[] =>
  Object.entries(
    signals.reduce<Record<string, RecoverySignal[]>>((acc, signal) => {
      const list = acc[signal.category] ?? [];
      acc[signal.category] = [...list, signal];
      return acc;
    }, {}),
  ).map(([category, values]) => {
    const severitySorted = values.map((signal) => normalizeSeverity(signal.severity));
    const latestObservedAt =
      values.sort((first, second) => first.observedAt.localeCompare(second.observedAt)).at(-1)!.observedAt;
    return {
      category: category as RecoverySignal['category'],
      averageSeverity: severitySorted.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length),
      count: values.length,
      latestObservedAt,
    };
  });

export const deriveMetrics = (bundle: RecoverySignalBundle): PipelineMetrics => {
  const parsed = parseBundle(bundle);
  const severities = parsed.signals.map((signal) => signal.severity);
  const activeSignals = parsed.signals.filter((signal) => normalizeSeverity(signal.severity) > 0.25);
  const rolling95thPercentile = weightedPercentile(severities, 0.95);

  return {
    tenantId: parsed.context.tenantId,
    totalSignals: parsed.signals.length,
    activeSignalRate: activeSignals.length / Math.max(1, parsed.signals.length),
    grouped: groupByCategory(parsed.signals),
    rolling95thPercentile,
  };
};

export const buildForecast = (
  bundle: RecoverySignalBundle,
  baselineMinutes: number,
): RecoveryForecast => {
  const metrics = deriveMetrics(bundle);
  const categoryWeight: Record<RecoverySignal['category'], number> = {
    availability: 0.5,
    latency: 0.25,
    dataQuality: 0.15,
    compliance: 0.1,
  };

  const confidenceBySignal = Object.fromEntries(
    metrics.grouped.map((entry) => [entry.category, Math.min(1, entry.averageSeverity + entry.count / 10)]),
  ) as Record<RecoverySignal['category'], number>;

  const multiplier = metrics.grouped.reduce((sum, entry) => sum + entry.averageSeverity * (categoryWeight[entry.category] ?? 0), 0);
  const density = metrics.activeSignalRate * metrics.rolling95thPercentile;

  return parseForecast({
    forecastId: `${bundle.context.runId}-forecast`,
    context: bundle.context,
    signalDensity: density,
    meanRecoveryMinutes: baselineMinutes * (1 + multiplier),
    confidence: Math.min(0.99, 0.2 + (1 - density) * 0.6 + multiplier * 0.2),
    confidenceBySignal,
  });
};

export const suggestActionsFromSignals = (
  bundle: RecoverySignalBundle,
): readonly RecoveryActionCandidate[] => {
  const groups = groupByCategory(bundle.signals);
  const ordered = [...groups].sort((first, second) => second.averageSeverity - first.averageSeverity);
  return ordered.map((group, index) => ({
    actionId: `${bundle.bundleId}-action-${index}` as RecoveryActionCandidate['actionId'],
    targetService: bundle.context.serviceName,
    description: `Mitigate ${group.category} degradation`,
    estimatedMinutes: Math.max(2, Math.ceil(group.averageSeverity * 60)),
    prerequisites: [
      `${bundle.context.tenantId}:checkpoint-${group.category}` as RecoveryActionCandidate['prerequisites'][number],
      `${group.count}` as RecoveryActionCandidate['prerequisites'][number],
    ],
    rollbackMinutes: 5 + index * 2,
  }));
};

export const proposeRecommendation = (
  bundle: RecoverySignalBundle,
  baselineMinutes = 10,
): RecoveryRecommendation => {
  const forecast = buildForecast(bundle, baselineMinutes);
  const actions = suggestActionsFromSignals(bundle);
  const severityAverage = bundle.signals.reduce((sum, signal) => sum + signal.severity, 0) / Math.max(1, bundle.signals.length);
  const score = Math.min(1, forecast.confidence * severityAverage * 1.25);

  return parseRecommendation({
    recommendationId: `${bundle.bundleId}-recommendation`,
    score,
    bucket: bucketPriority(score),
    rationale: `Forecasted recovery impact is ${forecast.meanRecoveryMinutes.toFixed(1)}m; critical signal density=${forecast.signalDensity.toFixed(2)}`,
    actions,
    predictedRiskReduction: Math.max(0.01, 1 - score / 2),
  });
};
