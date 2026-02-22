import type { NonEmptyArray, DeepReadonly } from '@shared/type-level';
import type {
  RecoverySignalInput,
  RecoverySimulationResult,
  ScenarioSeverity,
} from './models';

export interface SignalCluster {
  readonly primarySignalId: RecoverySignalInput['signalId'];
  readonly severity: ScenarioSeverity;
  readonly members: NonEmptyArray<RecoverySignalInput>;
}

export interface SignalGroupInput {
  readonly tenantId: RecoverySignalInput['tenantId'];
  readonly clusters: readonly SignalCluster[];
  readonly requestedWindowHours: number;
}

export interface SignalDensity {
  readonly tenantId: RecoverySignalInput['tenantId'];
  readonly perEntity: Readonly<Record<string, number>>;
  readonly perSource: Readonly<Record<string, number>>;
  readonly bySeverity: Readonly<Record<ScenarioSeverity, number>>;
}

export interface SignalSummary {
  readonly signalCount: number;
  readonly uniqueEntities: number;
  readonly averageConfidence: number;
  readonly peakSeverity: ScenarioSeverity;
  readonly density: SignalDensity;
}

export const summarizeSignals = (signals: readonly RecoverySignalInput[]): DeepReadonly<SignalSummary> => {
  const summary: SignalSummary = {
    signalCount: signals.length,
    uniqueEntities: new Set(signals.map((signal) => signal.entity)).size,
    averageConfidence: signals.reduce((sum, signal) => sum + signal.confidence, 0) / Math.max(signals.length, 1),
    peakSeverity: pickPeakSeverity(signals),
    density: buildDensity(signals[0]?.tenantId ?? '' as RecoverySignalInput['tenantId'], signals),
  };

  return summary;
};

export const buildClusters = (signals: readonly RecoverySignalInput[]): readonly SignalCluster[] => {
  const grouped = new Map<string, RecoverySignalInput[]>();

  for (const signal of signals) {
    const key = `${signal.entity}::${signal.fingerprint.code}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.push(signal);
    } else {
      grouped.set(key, [signal]);
    }
  }

  const clusters: SignalCluster[] = [];

  for (const members of grouped.values()) {
    const nonEmptyMembers = members as NonEmptyArray<RecoverySignalInput>;
    const [head] = nonEmptyMembers;

    clusters.push({
      primarySignalId: head.signalId,
      severity: pickPeakSeverity(nonEmptyMembers),
      members: nonEmptyMembers,
    });
  }

  return clusters.sort((left, right) => right.members.length - left.members.length);
};

export const estimateSignalLoad = (input: SignalGroupInput): number => {
  const severityScore = Object.values(input.clusters).reduce((sum, cluster) => {
    const severityWeight = severityToWeight(cluster.severity);
    return sum + cluster.members.length * severityWeight;
  }, 0);

  return severityScore / Math.max(1, input.clusters.length) + input.requestedWindowHours / 2;
};

export const estimateRecoveryHorizon = (result: RecoverySimulationResult): number => {
  return Math.max(1, Math.round(result.actionPlan.estimatedCompletionMinutes / 60));
};

const buildDensity = (tenantId: RecoverySignalInput['tenantId'], signals: readonly RecoverySignalInput[]): SignalDensity => {
  const byEntity: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const bySeverity: Record<ScenarioSeverity, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  for (const signal of signals) {
    byEntity[signal.entity] = (byEntity[signal.entity] ?? 0) + 1;
    bySource[signal.fingerprint.source] = (bySource[signal.fingerprint.source] ?? 0) + 1;
    bySeverity[signal.severity] += 1;
  }

  return {
    tenantId,
    perEntity: byEntity,
    perSource: bySource,
    bySeverity,
  };
};

const severityWeight: Record<ScenarioSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 5,
};

const pickPeakSeverity = (signals: readonly RecoverySignalInput[]): ScenarioSeverity => {
  const sorted = [...signals].sort((left, right) => severityWeight[right.severity] - severityWeight[left.severity]);
  return sorted.at(0)?.severity ?? 'low';
};

const severityToWeight = (severity: ScenarioSeverity): number => severityWeight[severity];
