import { type FabricSimulationResult } from '@domain/recovery-ops-fabric';

export interface FabricAnalyticsRow {
  readonly bucket: string;
  readonly avgStress: number;
  readonly avgRisk: number;
  readonly runs: number;
}

const bucketByConfidence = (confidence: number): string => {
  if (confidence >= 0.9) return 'A';
  if (confidence >= 0.75) return 'B';
  if (confidence >= 0.5) return 'C';
  return 'D';
};

export const aggregateAnalytics = (runs: readonly FabricSimulationResult[]): FabricAnalyticsRow[] => {
  const groups: Record<string, { totalStress: number; totalRisk: number; runs: number }> = {};

  for (const run of runs) {
    const bucket = bucketByConfidence(run.confidence);
    const existing = groups[bucket] ?? { totalStress: 0, totalRisk: 0, runs: 0 };
    existing.totalStress += run.stress;
    existing.totalRisk += run.riskScore;
    existing.runs += 1;
    groups[bucket] = existing;
  }

  return Object.entries(groups).map(([bucket, data]) => ({
    bucket,
    avgStress: Number((data.totalStress / Math.max(1, data.runs)).toFixed(4)),
    avgRisk: Number((data.totalRisk / Math.max(1, data.runs)).toFixed(4)),
    runs: data.runs,
  }));
};

export const trendFromRuns = (runs: readonly FabricSimulationResult[]): readonly number[] =>
  runs
    .slice()
    .sort((left, right) => right.riskScore - left.riskScore)
    .map((run) => run.riskScore);
