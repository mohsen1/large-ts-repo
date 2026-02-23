import { computeSnapshotAnalysis, type DrillHealthFrame, type DrillRunSnapshot } from '@domain/recovery-drill-lab';
import { listTelemetry } from '@data/recovery-drill-lab-store';

export interface InsightRecord {
  readonly runId: string;
  readonly suggestion: string;
  readonly frames: readonly DrillHealthFrame[];
  readonly trend: number;
}

const trendFromFrames = (frames: readonly DrillHealthFrame[]): number => {
  if (!frames.length) {
    return 0;
  }
  return frames[frames.length - 1]!.riskRatio - frames[0]!.riskRatio;
};

const renderSuggestion = (trend: number): string => {
  if (trend > 12) {
    return 'degrade-urgent';
  }
  if (trend < -12) {
    return 'improving';
  }
  return 'steady';
};

export const inferInsights = (snapshot: DrillRunSnapshot): InsightRecord => {
  const analysis = computeSnapshotAnalysis(snapshot);
  const telemetry = listTelemetry(snapshot.id);
  const combinedFrames = [...analysis.topRiskFrames, ...telemetry.flatMap((entry) => entry.frames)];
  const trend = trendFromFrames(combinedFrames);

  return {
    runId: snapshot.id,
    suggestion: renderSuggestion(trend),
    frames: combinedFrames,
    trend: Math.round(trend),
  };
};

export const summarizeSnapshotStatus = (snapshot: DrillRunSnapshot): string => {
  const insight = inferInsights(snapshot);
  return `${snapshot.id} -> status=${snapshot.status} | suggestion=${insight.suggestion} | trend=${insight.trend}`;
};
