import { normalizeLimit } from '@shared/core';

import type { RiskFinding, RiskSignal } from './types';

export interface EvidenceWindow {
  readonly from: string;
  readonly to: string;
  readonly includeRecoveries: boolean;
  readonly limit: number;
}

export interface EvidenceBundle {
  readonly runSignals: ReadonlyArray<RiskSignal>;
  readonly topFindings: readonly RiskFinding[];
  readonly score: number;
}

const isRecentSignal = (signal: RiskSignal, from: string, to: string): boolean => {
  const observed = Date.parse(signal.observedAt);
  const start = Date.parse(from);
  const end = Date.parse(to);
  return Number.isFinite(observed) && observed >= start && observed <= end;
};

export const sliceSignalsByWindow = (
  signals: readonly RiskSignal[],
  window: EvidenceWindow,
): readonly RiskSignal[] => {
  const limited = normalizeLimit(window.limit);
  return signals
    .filter((signal) => isRecentSignal(signal, window.from, window.to))
    .slice(0, limited)
    .filter(() => window.includeRecoveries);
};

export const evidenceIndex = (signal: RiskSignal): string => `${signal.runId}:${signal.metricName}:${signal.dimension}`;

export const bundleEvidence = (
  runId: string,
  signals: readonly RiskSignal[],
  findings: readonly RiskFinding[],
): EvidenceBundle => ({
  runSignals: signals.filter((signal) => signal.runId === runId),
  topFindings: findings.slice(0, 10),
  score: findings.reduce((sum, finding) => sum + finding.score, 0),
});

export const flattenSignals = (...parts: readonly (readonly RiskSignal[])[]): readonly RiskSignal[] =>
  parts.flatMap((batch) => batch);
