import type { Brand } from '@shared/core';
import type { RecoveryRiskSignal, RunAssessment, CohortSignalAggregate } from './types';
import { buildBatchAssessment, aggregateByTenantAndRun } from './evaluator';

export type SignalTimelineId = Brand<string, 'SignalTimelineId'>;
export type TimelineDirection = 'forwards' | 'backwards';
export type Trend = 'improving' | 'stable' | 'degrading';

export interface SignalHistoryWindow {
  readonly from: string;
  readonly to: string;
  readonly runCount: number;
}

export interface SignalTimelinePoint {
  readonly signalId: string;
  readonly runId: string;
  readonly severity: number;
  readonly confidence: number;
  readonly observedAt: string;
}

export interface SignalTimeline {
  readonly timelineId: SignalTimelineId;
  readonly tenant: string;
  readonly direction: TimelineDirection;
  readonly windows: readonly SignalHistoryWindow[];
  readonly points: readonly SignalTimelinePoint[];
  readonly trend: Trend;
}

export interface TimelineAnalysis {
  readonly timelineId: SignalTimelineId;
  readonly tenant: string;
  readonly trend: Trend;
  readonly severityDelta: number;
  readonly confidenceDelta: number;
  readonly cohorts: readonly CohortSignalAggregate[];
}

const trendFor = (delta: number): Trend => {
  if (delta > 0.15) return 'degrading';
  if (delta < -0.15) return 'improving';
  return 'stable';
};

export const buildHistoryWindows = (
  tenant: string,
  signals: readonly RecoveryRiskSignal[],
): SignalHistoryWindow[] => {
  const now = Date.now();
  const ordered = signals
    .slice()
    .sort((left, right) => right.window.from.localeCompare(left.window.from))
    .filter((signal) => signal.window.tenant === tenant);
  const windows: SignalHistoryWindow[] = [];
  for (let index = 0; index < ordered.length; index++) {
    const current = ordered[index];
    if (!current) continue;
    const pointStart = new Date(current.window.from).getTime();
    const pointEnd = new Date(current.window.to).getTime();
    if (!Number.isFinite(pointStart) || !Number.isFinite(pointEnd)) {
      continue;
    }
    windows.push({
      from: current.window.from,
      to: current.window.to,
      runCount: Math.max(1, Math.round((now - pointStart) / (60 * 1000) + index)),
    });
  }

  return windows;
};

const timelinePointFromSignal = (signal: RecoveryRiskSignal): SignalTimelinePoint => ({
  signalId: signal.envelopeId,
  runId: signal.runId,
  severity: signal.signal.severity,
  confidence: signal.signal.confidence,
  observedAt: signal.window.to,
});

export const buildSignalTimeline = (
  tenant: string,
  signals: readonly RecoveryRiskSignal[],
  direction: TimelineDirection = 'forwards',
): SignalTimeline => {
  const points = signals
    .filter((signal) => signal.window.tenant === tenant)
    .map(timelinePointFromSignal)
    .toSorted((left, right) => {
      if (direction === 'forwards') {
        return left.observedAt.localeCompare(right.observedAt);
      }
      return right.observedAt.localeCompare(left.observedAt);
    });

  const windows = buildHistoryWindows(tenant, signals);
  const severities = points.map((point) => point.severity);
  const confidences = points.map((point) => point.confidence);
  const deltas = severities.map((value, index) =>
    index === 0 ? 0 : value - (severities[index - 1] ?? value),
  );
  const trend = trendFor(deltas.reduce((acc, delta) => acc + delta, 0) / Math.max(deltas.length, 1));

  return {
    timelineId: `${tenant}-timeline-${Date.now()}` as SignalTimelineId,
    tenant,
    direction,
    windows,
    points,
    trend,
  };
};

export const analyzeSignalHistory = (
  tenant: string,
  signals: readonly RecoveryRiskSignal[],
  runAssessments: readonly RunAssessment[],
): TimelineAnalysis => {
  const timeline = buildSignalTimeline(tenant, signals, 'forwards');
  const cohorts = aggregateByTenantAndRun(signals).filter((cohort) => cohort.tenant === tenant);
  const batch = buildBatchAssessment(cohorts);
  const severityTrend = timeline.points.slice(-1)[0];
  const severityBase = timeline.points[0];
  const avgConfidence = timeline.points.length
    ? timeline.points.reduce((acc, point) => acc + point.confidence, 0) / timeline.points.length
    : 0;
  const baseConfidence = avgConfidence / Math.max(cohorts.length, 1);

  const maxAssessment = runAssessments.reduce(
    (acc, assessment) => {
      if (!acc) return assessment;
      return assessment.riskScore > acc.riskScore ? assessment : acc;
    },
    runAssessments[0],
  );

  const severityDelta = severityTrend?.severity
    ? severityTrend.severity - (severityBase?.severity ?? severityTrend.severity)
    : 0;
  const confidenceDelta = maxAssessment ? maxAssessment.confidence - baseConfidence : 0;
  return {
    timelineId: timeline.timelineId,
    tenant,
    trend: timeline.trend,
    severityDelta,
    confidenceDelta,
    cohorts,
  };
};

export const trendRecommendations = (analysis: TimelineAnalysis): readonly string[] => {
  const recommendations: string[] = [];
  if (analysis.trend === 'degrading') {
    recommendations.push('increase-operator-coverage', 'tighten-timeouts');
  }
  if (analysis.severityDelta > 1) {
    recommendations.push('open-incident-channel', 'run-governance-review');
  }
  if (analysis.confidenceDelta < -0.2) {
    recommendations.push('add-observability', 'recalibrate-sources');
  }
  if (analysis.trend === 'improving') {
    recommendations.push('allow-lower-approval', 'extend-window');
  }
  if (analysis.cohorts.length > 5) {
    recommendations.push('split-lane-by-cohort');
  }
  return recommendations;
};
