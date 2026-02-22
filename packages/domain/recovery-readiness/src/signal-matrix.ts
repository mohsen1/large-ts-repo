import type { ReadinessSignal, ReadinessSeverity, ReadinessTarget, ReadinessRunId } from './types';

export interface SignalMatrixCell {
  targetId: ReadinessTarget['id'];
  severity: ReadinessSeverity;
  count: number;
}

export interface SignalMatrix {
  runId: ReadinessRunId;
  generatedAt: string;
  cells: SignalMatrixCell[];
  totalSignals: number;
}

export interface SignalProfile {
  signalId: ReadinessSignal['signalId'];
  runId: ReadinessRunId;
  targetId: ReadinessTarget['id'];
  trend: 'rising' | 'stable' | 'declining';
  delta: number;
}

const severityWeightMap: Record<ReadinessSeverity, number> = {
  low: 1,
  medium: 2,
  high: 5,
  critical: 10,
};

function severityWeight(severity: ReadinessSignal['severity']): number {
  return severityWeightMap[severity] ?? 1;
}

export function buildSignalMatrix(signals: readonly ReadinessSignal[]): SignalMatrix {
  const cells = signals.reduce<SignalMatrixCell[]>((acc, signal) => {
    const existing = acc.find((entry) => entry.targetId === signal.targetId && entry.severity === signal.severity);
    if (existing) {
      existing.count += 1;
      return acc;
    }

    acc.push({
      targetId: signal.targetId,
      severity: signal.severity,
      count: 1,
    });

    return acc;
  }, []);

  return {
    runId: signals[0]?.runId ?? ('run:unbound' as ReadinessRunId),
    generatedAt: new Date().toISOString(),
    cells,
    totalSignals: signals.length,
  };
}

export function weightedRiskDensity(signals: readonly ReadinessSignal[]): number {
  if (signals.length === 0) {
    return 0;
  }

  const weighted = signals.reduce((acc, signal) => acc + severityWeight(signal.severity), 0);
  return Number((weighted / signals.length).toFixed(2));
}

export function summarizeProfiles(signals: readonly ReadinessSignal[]): SignalProfile[] {
  const latestBySource = new Map<string, number>();
  const profiles: SignalProfile[] = [];

  for (const signal of signals) {
    const key = `${signal.runId}:${signal.targetId}`;
    const captured = Date.parse(signal.capturedAt);
    const previous = latestBySource.get(key);

    if (previous == null) {
      latestBySource.set(key, captured);
      continue;
    }

    const deltaMs = captured - previous;
    const weight = severityWeight(signal.severity);
    const trend = deltaMs > 120000 ? (weight >= 5 ? 'rising' : 'stable') : weight >= 8 ? 'stable' : 'declining';

    profiles.push({
      signalId: signal.signalId,
      runId: signal.runId,
      targetId: signal.targetId,
      trend,
      delta: deltaMs,
    });

    latestBySource.set(key, captured);
  }

  return profiles;
}

export function criticalityScoreByTarget(signals: readonly ReadinessSignal[]): Map<ReadinessTarget['id'], number> {
  const grouped = new Map<ReadinessTarget['id'], number>();

  for (const signal of signals) {
    const next = grouped.get(signal.targetId) ?? 0;
    grouped.set(signal.targetId, next + severityWeight(signal.severity));
  }

  return grouped;
}
