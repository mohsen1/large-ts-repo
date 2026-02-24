import type { IncidentLabScenario, IncidentLabRun, IncidentLabSignal, IncidentLabPlan } from './types';

export interface MetricPoint {
  readonly timestamp: string;
  readonly key: string;
  readonly value: number;
}

export interface MetricSeries {
  readonly series: readonly MetricPoint[];
  readonly unit: string;
  readonly min: number;
  readonly max: number;
  readonly avg: number;
}

export interface RecoveryMetrics {
  readonly scenario: IncidentLabScenario['id'];
  readonly run: IncidentLabRun['runId'];
  readonly throughput: MetricSeries;
  readonly latency: MetricSeries;
  readonly integrity: MetricSeries;
  readonly signalCount: number;
}

export const buildSeries = (key: string, points: readonly number[]): MetricSeries => {
  const min = points.length > 0 ? Math.min(...points) : 0;
  const max = points.length > 0 ? Math.max(...points) : 0;
  const avg = points.length > 0 ? points.reduce((acc, value) => acc + value, 0) / points.length : 0;
  const now = new Date().toISOString();
  const series = points.map((point, index) => ({
    timestamp: new Date(Date.now() + index * 1000).toISOString(),
    key,
    value: point,
  }));
  return {
    series,
    unit: key,
    min: Number(min.toFixed(2)),
    max: Number(max.toFixed(2)),
    avg: Number(avg.toFixed(2)),
  };
};

export const toScenarioKey = (scenario: IncidentLabScenario): string => `scenario:${scenario.id}`;

export const createSignalSeries = (signals: readonly IncidentLabSignal[]): RecoveryMetrics => {
  const now = new Date().toISOString();
  const throughputPoints = signals.filter((signal) => signal.kind === 'capacity').map((signal) => signal.value);
  const latencyPoints = signals.filter((signal) => signal.kind === 'latency').map((signal) => signal.value);
  const integrityPoints = signals.filter((signal) => signal.kind === 'integrity').map((signal) => signal.value);

  return {
    scenario: signals[0]?.at ? signals[0].node : 'unknown',
    run: `run:${Date.now()}` as unknown as IncidentLabRun['runId'],
    throughput: buildSeries('throughput', throughputPoints),
    latency: buildSeries('latency', latencyPoints),
    integrity: buildSeries('integrity', integrityPoints),
    signalCount: signals.length,
  } as RecoveryMetrics;
};

export const aggregateByNode = (signals: readonly IncidentLabSignal[]): Record<string, number> =>
  signals.reduce<Record<string, number>>((acc, signal) => {
    acc[signal.node] = (acc[signal.node] ?? 0) + 1;
    return acc;
  }, {});

export const estimateRecoveryVelocity = (plan: IncidentLabPlan, run: IncidentLabRun): number => {
  const throughput = Math.max(0, run.results.length / Math.max(1, plan.selected.length));
  const failPenalty = run.results.filter((result) => result.status === 'failed').length * 0.2;
  return Number((throughput * (1 - failPenalty)).toFixed(3));
};

export const scoreFromRun = (run: IncidentLabRun): number => {
  if (run.results.length === 0) {
    return 0;
  }
  const done = run.results.filter((result) => result.status === 'done').length;
  const failed = run.results.filter((result) => result.status === 'failed').length;
  const skipped = run.results.filter((result) => result.status === 'skipped').length;
  return ((done * 3 - failed * 4 - skipped) / run.results.length) * 100;
};

export const normalizeMetric = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

export const trendSeries = (series: MetricSeries): readonly MetricPoint[] =>
  [...series.series].sort((left, right) => left.timestamp.localeCompare(right.timestamp));

export const latestMetric = (series: MetricSeries): MetricPoint | undefined => {
  const sorted = trendSeries(series);
  return sorted[sorted.length - 1];
};
