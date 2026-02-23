import type {
  ReadinessRun,
  ReadinessPriority,
} from '@domain/recovery-readiness/playbook-models';

export interface ReadinessMetricSnapshot {
  playbookId: string;
  runCount: number;
  completedCount: number;
  failedCount: number;
  averageRiskScore: number;
  maxRiskScore: number;
  byPriority: Record<ReadinessPriority, number>;
}

export interface ReadinessRunSeriesPoint {
  bucket: string;
  totalRuns: number;
  completed: number;
  failed: number;
}

const toBucket = (isoDate: string, bucketMinutes: number): string => {
  const date = new Date(isoDate);
  const roundedMinutes = Math.floor(date.getUTCMinutes() / bucketMinutes) * bucketMinutes;
  return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}T${date.getUTCHours()}:${roundedMinutes.toString().padStart(2, '0')}Z`;
};

export const summarizeRuns = (runs: ReadinessRun[], bucketMinutes: number): ReadinessMetricSnapshot => {
  if (runs.length === 0) {
    return {
      playbookId: 'none',
      runCount: 0,
      completedCount: 0,
      failedCount: 0,
      averageRiskScore: 0,
      maxRiskScore: 0,
      byPriority: {
        low: 0,
        normal: 0,
        high: 0,
        critical: 0,
      },
    };
  }

  const byPriority = { low: 0, normal: 0, high: 0, critical: 0 } as Record<ReadinessPriority, number>;
  let completedCount = 0;
  let failedCount = 0;
  let riskAccumulator = 0;
  let maxRiskScore = 0;

  for (const run of runs) {
    byPriority[run.priority] += 1;
    if (run.status === 'completed') completedCount += 1;
    if (run.status === 'failed') failedCount += 1;
    riskAccumulator += run.riskScore;
    maxRiskScore = Math.max(maxRiskScore, run.riskScore);
  }

  return {
    playbookId: runs[0].playbookId,
    runCount: runs.length,
    completedCount,
    failedCount,
    averageRiskScore: riskAccumulator / runs.length,
    maxRiskScore,
    byPriority,
  };
};

export const buildSeries = (runs: ReadinessRun[], bucketMinutes = 15): ReadinessRunSeriesPoint[] => {
  const map = new Map<string, ReadinessRunSeriesPoint>();
  for (const run of runs) {
    const key = toBucket(run.startedAt, bucketMinutes);
    const bucket = map.get(key) ?? { bucket: key, totalRuns: 0, completed: 0, failed: 0 };
    bucket.totalRuns += 1;
    if (run.status === 'completed') bucket.completed += 1;
    if (run.status === 'failed') bucket.failed += 1;
    map.set(key, bucket);
  }
  return [...map.values()].sort((left, right) => left.bucket.localeCompare(right.bucket));
};

export const classifyRiskTrend = (runs: ReadinessRun[]): 'stable' | 'improving' | 'degrading' | 'volatile' => {
  if (runs.length <= 1) return 'stable';
  const scores = runs
    .map((run) => run.riskScore)
    .sort((left, right) => left - right);
  const mid = Math.floor(scores.length / 2);
  const q1 = scores[Math.max(0, mid - 1)] ?? scores[0];
  const q3 = scores[Math.min(scores.length - 1, mid + 1)] ?? scores[0];

  if (q3 - q1 < 0.05) return 'stable';
  if (runs.at(-1) && runs.at(0) && runs.at(-1)!.riskScore > runs.at(0)!.riskScore) return 'degrading';
  if (runs.at(-1) && runs.at(0) && runs.at(-1)!.riskScore < runs.at(0)!.riskScore) return 'improving';
  return 'volatile';
};
