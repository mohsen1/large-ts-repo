import { useMemo } from 'react';
import type { LabSignal, OrchestrationLab } from '@domain/recovery-ops-orchestration-lab';
import type { OrchestratedLabRun } from '@service/recovery-ops-orchestration-engine/orchestrated-lab';

export interface SignalTrendPoint {
  readonly tier: LabSignal['tier'];
  readonly count: number;
  readonly score: number;
}

export interface SignalWorkspace {
  readonly criticalCount: number;
  readonly warningCount: number;
  readonly signalCount: number;
  readonly maxScore: number;
  readonly avgScore: number;
  readonly trends: readonly SignalTrendPoint[];
}

const bucketSignalScore = (signal: LabSignal): number => Math.max(0, Math.min(100, signal.score));

const sortByScore = (signals: readonly LabSignal[]): readonly LabSignal[] =>
  [...signals].toSorted((left, right) => right.score - left.score);

const pickTier = (tier: LabSignal['tier']): LabSignal['tier'] => tier;

export const useRecoveryOpsLabSignals = (lab?: OrchestrationLab, run?: OrchestratedLabRun): SignalWorkspace => {
  const signals = useMemo(() => lab?.signals ?? [], [lab]);
  const sorted = useMemo(() => sortByScore(signals), [signals]);
  const criticalSignals = useMemo(() => sorted.filter((signal) => pickTier(signal.tier) === 'critical'), [sorted]);
  const warningSignals = useMemo(() => sorted.filter((signal) => pickTier(signal.tier) === 'warning'), [sorted]);
  const scoreSum = sorted.reduce((acc, signal) => acc + bucketSignalScore(signal), 0);
  const maxScore = sorted[0]?.score ?? 0;

  const scoreByTier = sorted.reduce<Record<LabSignal['tier'], number>>(
    (acc, signal) => {
      const index = acc[signal.tier] ?? 0;
      acc[signal.tier] = index + bucketSignalScore(signal);
      return acc;
    },
    { signal: 0, warning: 0, critical: 0 },
  );

  const runLabel = run ? run.envelope.id : 'idle';

  const trends = sorted.reduce<Record<LabSignal['tier'], { tier: LabSignal['tier']; count: number; score: number }>>((acc, signal) => {
    const label = signal.tier;
    const trend = acc[label];
    if (trend) {
      acc[label] = {
        tier: label,
        count: trend.count + 1,
        score: trend.score + bucketSignalScore(signal),
      };
    } else {
      acc[label] = { tier: label, count: 1, score: bucketSignalScore(signal) };
    }
    return acc;
  }, { signal: { tier: 'signal', count: 0, score: 0 }, warning: { tier: 'warning', count: 0, score: 0 }, critical: { tier: 'critical', count: 0, score: 0 } });

  return {
    criticalCount: criticalSignals.length,
    warningCount: warningSignals.length,
    signalCount: sorted.length,
    maxScore,
    avgScore: sorted.length === 0 ? 0 : Number((scoreSum / sorted.length).toFixed(2)),
    trends: Object.values(trends).map((entry) => ({
      ...entry,
      score: run ? entry.score * 0.01 : entry.score * 0.95,
    })),
  };
};
