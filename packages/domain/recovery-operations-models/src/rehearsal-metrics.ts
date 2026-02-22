import { withBrand } from '@shared/core';
import type { Brand } from '@shared/core';
import {
  RehearsalExecutionRecord,
  RehearsalExecutionState,
  RehearsalId,
  RehearsalRiskLevel,
  RehearsalStep,
  RehearsalStepId,
  RehearsalStepExecutionState,
  RehearsalSummary,
  RehearsalWindow,
  RehearsalSignal,
  RehearsalQueryFilter,
  normalizeRehearsalSummary,
} from './rehearsal-plan';

export interface RehearsalMetricPoint {
  readonly at: string;
  readonly dimension: 'coverage' | 'accuracy' | 'latency' | 'completeness';
  readonly value: number;
  readonly tags: readonly string[];
}

export interface RehearsalCoverageDigest {
  readonly runId: Brand<string, 'RehearsalRunId'>;
  readonly coverage: number;
  readonly score: number;
  readonly riskLevel: RehearsalRiskLevel;
  readonly points: readonly RehearsalMetricPoint[];
}

export interface RehearsalMetricSeries {
  readonly metricName: string;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly points: readonly RehearsalMetricPoint[];
  readonly summary: RehearsalSummary;
}

const defaultRiskBuckets: readonly RehearsalRiskLevel[] = ['low', 'medium', 'high', 'critical'];

export const computeStepCoverage = (steps: readonly RehearsalStep[]): number => {
  if (steps.length === 0) return 0;

  const weighted = steps.reduce((acc, step, index) => {
    const weight = index + 1;
    const point = step.status === 'success' || step.status === 'skipped' ? 1 : 0;
    return {
      totalWeight: acc.totalWeight + weight,
      completedWeight: acc.completedWeight + point * weight,
    };
  }, { totalWeight: 0, completedWeight: 0 });

  return weighted.totalWeight ? weighted.completedWeight / weighted.totalWeight : 0;
};

export const computeSignalDensity = (signals: readonly RehearsalSignal[]): number => {
  if (signals.length === 0) return 0;

  const byTenant = signals.reduce<Record<string, number>>((acc, signal) => {
    const key = signal.tenant;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const entropy = Object.values(byTenant).reduce((acc, count) => {
    const ratio = count / signals.length;
    return acc - ratio * Math.log2(ratio);
  }, 0);

  return Number(entropy.toFixed(3));
};

export const computeReadinessScore = (
  summary: RehearsalSummary,
  coverage: number,
  windows: readonly RehearsalWindow[],
): number => {
  const stepWeight = summary.totalSteps > 0 ? (summary.completedSteps / summary.totalSteps) : 0;
  const riskPenalty = defaultRiskBuckets.indexOf(summary.readinessScore >= 0.85 ? 'low' : 'critical') >= 0
    ? 1 - Number((summary.riskSignalCount / Math.max(1, summary.totalSteps + 3)).toFixed(3))
    : 0;
  const windowPenalty = Math.max(0.65, 1 - (windows.length * 0.03));
  return Number((stepWeight * 0.45 + coverage * 0.35 + riskPenalty * 0.2 * windowPenalty).toFixed(3));
};

export const inWindow = (value: string, window?: RehearsalWindow): boolean => {
  if (!window) return true;

  const signalTs = Date.parse(value);
  const start = Date.parse(window.from);
  const end = Date.parse(window.to);

  if (!Number.isFinite(signalTs) || !Number.isFinite(start) || !Number.isFinite(end)) {
    return false;
  }

  return signalTs >= start && signalTs <= end;
};

export const aggregateByRisk = (
  records: readonly RehearsalExecutionRecord[],
  riskProfile: Readonly<Record<RehearsalRiskLevel, number>>,
): RehearsalCoverageDigest[] => records.map((record, index) => {
  const byRun = Object.entries(riskProfile).map(([riskLevel, score]) => ({
    risk: riskLevel as RehearsalRiskLevel,
    score,
  }));
  const primary = byRun[0]?.risk ?? 'medium';

  const points = byRun.map((entry, pointIndex) => ({
    at: record.startedAt,
    dimension: (pointIndex % 2 === 0 ? 'coverage' : 'accuracy') as RehearsalMetricPoint['dimension'],
    value: entry.score,
    tags: [String(entry.risk)],
  }));

  return {
    runId: withBrand(String(record.runId), 'RehearsalRunId'),
    coverage: record.summary.totalSteps ? record.summary.completedSteps / record.summary.totalSteps : 0,
    score: points.reduce((acc, point) => acc + point.value, 0),
    riskLevel: primary,
    points,
  };
});

export const summarizeSteps = (steps: readonly RehearsalStep[]): {
  readonly byState: Record<RehearsalStepExecutionState, number>;
  readonly byLane: Record<string, number>;
  readonly avgConfidence: number;
  readonly ordered: readonly RehearsalStepId[];
} => {
  const byState = steps.reduce<Record<string, number>>((acc, step) => {
    acc[step.status] = (acc[step.status] ?? 0) + 1;
    return acc;
  }, {});

  const byLane = steps.reduce<Record<string, number>>((acc, step) => {
    acc[step.lane] = (acc[step.lane] ?? 0) + 1;
    return acc;
  }, {});

  const avgConfidence = steps.length
    ? steps.reduce((acc, step) => acc + step.estimatedSuccessProbability, 0) / steps.length
    : 0;

  const ordered = [...steps]
    .sort((left, right) => {
      const leftMs = left.expectedDurationMinutes;
      const rightMs = right.expectedDurationMinutes;
      return leftMs - rightMs;
    })
    .map((step) => step.id);

  return {
    byState: {
      'not-started': byState['not-started'] ?? 0,
      'in-progress': byState['in-progress'] ?? 0,
      success: byState.success ?? 0,
      failed: byState.failed ?? 0,
      skipped: byState.skipped ?? 0,
    },
    byLane,
    avgConfidence,
    ordered,
  };
};

export const buildMetricSeries = (
  tenant: Brand<string, 'TenantId'>,
  record: RehearsalExecutionRecord,
  filter?: RehearsalQueryFilter,
): RehearsalMetricSeries => {
  const summary = normalizeRehearsalSummary(record.summary);
  const filteredSignals = [] as RehearsalSignal[];

  if (filter?.window) {
    for (const signal of filteredSignals) {
      if (!inWindow(signal.observedAt, filter.window)) {
        continue;
      }
    }
  }

  const filteredSteps = record.timeline.length ? record.timeline : [] as RehearsalStep[];
  const coverage = filteredSteps.length ? computeStepCoverage(filteredSteps) : 0;
  const points = [
    {
      at: record.startedAt,
      dimension: 'coverage' as const,
      value: coverage,
      tags: ['step-coverage'],
    },
    {
      at: record.startedAt,
      dimension: 'latency' as const,
      value: record.summary.durationMinutes,
      tags: ['duration'],
    },
    {
      at: record.startedAt,
      dimension: 'accuracy' as const,
      value: computeSignalDensity(filteredSignals),
      tags: ['signal-density'],
    },
    {
      at: record.startedAt,
      dimension: 'completeness' as const,
      value: summary.readinessScore,
      tags: ['completion'],
    },
  ];

  return {
    metricName: 'rehearsal-coverage',
    tenant,
    points,
    summary,
  };
};

export const toExecutionStatePriority = (state: RehearsalExecutionState): number => {
  const priorities: Readonly<Record<RehearsalExecutionState, number>> = {
    failed: 0,
    cancelled: 1,
    paused: 2,
    planning: 3,
    scheduled: 4,
    running: 5,
    completed: 6,
  };

  return priorities[state] ?? 0;
};
