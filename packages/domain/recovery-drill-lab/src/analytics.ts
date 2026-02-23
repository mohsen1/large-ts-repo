import { type DrillHealthFrame, type DrillRunSnapshot, type DrillRunSummary, type DrillWorkspaceId, buildSummaryLine, describeRiskBand } from './types';
import { mapWorkspacePage } from './workflow';

export interface SnapshotAnalysis {
  readonly summary: DrillRunSummary;
  readonly frameCount: number;
  readonly dominantFamily: string;
  readonly riskTrend: number;
  readonly topRiskFrames: readonly DrillHealthFrame[];
  readonly healthBand: 'green' | 'yellow' | 'red';
}

const frameForSnapshot = (snapshot: DrillRunSnapshot, stage: DrillHealthFrame['stage'], completion: number): DrillHealthFrame => ({
  timestamp: snapshot.updatedAt,
  stage,
  completionRatio: completion,
  riskRatio: snapshot.riskBudgetPercent * 100 + completion / 2,
});

export const computeFrames = (snapshot: DrillRunSnapshot): readonly DrillHealthFrame[] => {
  const total = Math.max(1, snapshot.steps.length);
  const completed = snapshot.steps.filter((step) => step.status === 'succeeded').length;
  const warning = snapshot.steps.filter((step) => step.status === 'warning').length;
  const active = Math.round((completed / total) * 100);
  const warm = Math.max(0, active - 10);
  const cool = Math.min(100, active + warning * 5);
  return [
    frameForSnapshot(snapshot, 'warm', warm),
    frameForSnapshot(snapshot, 'active', active),
    frameForSnapshot(snapshot, 'cooldown', cool),
  ];
};

export const computeSnapshotAnalysis = (snapshot: DrillRunSnapshot): SnapshotAnalysis => {
  const frames = computeFrames(snapshot);
  const summary = buildSummaryLine(snapshot);
  const familyScores = new Map<string, number>();

  for (const step of snapshot.steps) {
    familyScores.set(step.family, (familyScores.get(step.family) ?? 0) + 1);
  }

  const [dominantFamily] = [...familyScores.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['restore', 0];
  const riskTrend = frames.reduce((total, frame, index, list) => {
    if (index === 0) {
      return 0;
    }
    return total + (frame.riskRatio - list[index - 1]!.riskRatio);
  }, 0);

  return {
    summary,
    frameCount: frames.length,
    dominantFamily,
    riskTrend,
    topRiskFrames: frames,
    healthBand: describeRiskBand(100 - summary.riskScore),
  };
};

export const compareRuns = (current: DrillRunSummary, previous: DrillRunSummary | undefined): 'improving' | 'degrading' | 'stable' => {
  if (!previous) {
    return 'stable';
  }
  if (current.healthScore > previous.healthScore && current.riskScore <= previous.riskScore) {
    return 'improving';
  }
  if (current.healthScore < previous.healthScore && current.riskScore >= previous.riskScore) {
    return 'degrading';
  }
  return 'stable';
};
