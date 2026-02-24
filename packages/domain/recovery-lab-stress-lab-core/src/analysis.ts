import type { Brand } from '@shared/orchestration-lab-core';
import { summarizeByIterator, normalizeScore, toMap, supportsIteratorFrom, iteratorFrom, pairwiseIterator } from '@shared/orchestration-lab-core';
import type { LabPlanInput, LabPhase, StageLabel, LabMode } from './types';
import type { ChaosRuntimeSignal } from './contracts';
import type { RecoverySignal } from '@shared/orchestration-lab-core';

export interface SignalDistribution {
  readonly severity: string;
  readonly count: number;
  readonly normalized: number;
}

export interface SignalAnalytics {
  readonly tenant: string;
  readonly totalSignals: number;
  readonly uniqueFingerprints: number;
  readonly topStage: StageLabel;
  readonly severityBuckets: readonly SignalDistribution[];
  readonly fingerprint: string;
}

const toTopStage = (mode: LabMode, phase: LabPhase): StageLabel => `stage:${phase}` as StageLabel;

const toRuntimeCategory = (category: RecoverySignal['category']): `signal:${string}` => `signal:${category}`;

const toRuntimeFingerprint = (value: string): Brand<string, 'SignalHash'> => value as Brand<string, 'SignalHash'>;

const toChaosRuntime = (signal: RecoverySignal, mode: LabMode): ChaosRuntimeSignal => ({
  category: toRuntimeCategory(signal.category),
  severity: `severity:${signal.severity}`,
  fingerprint: toRuntimeFingerprint(signal.id),
  mode,
  tenant: signal.tenant,
});

export const buildDistribution = (signals: readonly ChaosRuntimeSignal[]): readonly SignalDistribution[] => {
  const grouped = summarizeByIterator(signals, (signal) => signal.severity.replace('severity:', ''));
  const total = signals.length;
  return grouped.map(([severity, count]) => ({
    severity,
    count,
    normalized: normalizeScore(total === 0 ? 0 : count / total),
  }));
};

export const analyzeSignals = (input: LabPlanInput): SignalAnalytics => {
  const map = toMap(input.signals, (signal) => signal.id);
  const buckets = buildDistribution(
    input.signals.map((signal) => toChaosRuntime(signal, input.mode)),
  );
  const dominant = buckets.length ? buckets.slice().sort((left, right) => right.count - left.count)[0] : undefined;
  const topStage = toTopStage(input.mode, dominant?.severity === 'critical' ? 'discovery' : 'execution');
  return {
    tenant: input.tenant,
    totalSignals: input.signals.length,
    uniqueFingerprints: map.size,
    topStage,
    severityBuckets: buckets,
    fingerprint: `${input.tenant}:${input.runId}:${input.signals.length}`,
  };
};

export const analyzePairwise = (signals: readonly ChaosRuntimeSignal[]): readonly [string, string][] => {
  const pairs = pairwiseIterator(signals);
  return [...pairs].map(([left, right]) => [left.category, right.category]);
};

export const supportsIteratorHelpers = async (): Promise<boolean> => {
  return (await Promise.resolve(supportsIteratorFrom())).supported;
};

export const sampleSignalWindow = async (signals: readonly ChaosRuntimeSignal[]): Promise<readonly ChaosRuntimeSignal[]> => {
  const capable = await supportsIteratorHelpers();
  if (!capable) {
    return [...signals];
  }
  const source = iteratorFrom(signals);
  return [...source].slice(0, Math.min(16, signals.length));
};
