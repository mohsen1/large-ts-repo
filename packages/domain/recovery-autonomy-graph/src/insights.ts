import {
  AUTONOMY_SCOPE_SEQUENCE,
  type AutonomyScope,
  type AutonomyExecutionOutput,
  type AutonomySignalEnvelope,
} from './models';

export interface BundleStats {
  readonly totalSignals: number;
  readonly scoreSum: number;
  readonly scoreMax: number;
  readonly byScope: Record<AutonomyScope, number>;
}

export interface BundleHealth {
  readonly score: number;
  readonly topScope: AutonomyScope;
  readonly signals: number;
  readonly warningScopes: readonly AutonomyScope[];
}

export const scoreFromSignals = (signals: readonly AutonomySignalEnvelope[]): BundleStats => {
  const byScope = AUTONOMY_SCOPE_SEQUENCE.reduce<Record<AutonomyScope, number>>((acc, scope) => {
    acc[scope] = 0;
    return acc;
  }, {} as Record<AutonomyScope, number>);

  const totals = signals.reduce(
    (acc, signal) => {
      const safeScore = Number.isFinite(signal.score) ? signal.score : 0;
      byScope[signal.scope] = (byScope[signal.scope] ?? 0) + 1;
      return {
        total: acc.total + safeScore,
        max: Math.max(acc.max, safeScore),
      };
    },
    { total: 0, max: 0 },
  );

  return {
    totalSignals: signals.length,
    scoreSum: totals.total,
    scoreMax: totals.max,
    byScope,
  };
};

export const healthFromSignals = (signals: readonly AutonomySignalEnvelope[]): BundleHealth => {
  const stats = scoreFromSignals(signals);
  const warningScopes = AUTONOMY_SCOPE_SEQUENCE.filter((scope) => (stats.byScope[scope] ?? 0) > 0);

  return {
    score: signals.length ? stats.scoreSum / signals.length : 0,
    topScope: warningScopes[0] ?? AUTONOMY_SCOPE_SEQUENCE[0],
    signals: stats.totalSignals,
    warningScopes,
  };
};

export const inspectOutputBundle = (bundle: readonly AutonomyExecutionOutput[]): AutonomySignalEnvelope[] =>
  bundle.map((output) => output.signal);

export const summarizeSignals = (signals: readonly AutonomySignalEnvelope[]) => {
  const grouped = signals.reduce<Record<AutonomyScope, number>>((acc, signal) => {
    acc[signal.scope] = (acc[signal.scope] ?? 0) + 1;
    return acc;
  }, {} as Record<AutonomyScope, number>);

  const sorted = [...signals].toSorted((left, right) => right.score - left.score);

  return {
    byScope: grouped,
    ids: sorted.map((signal) => signal.signalId),
    topSignal: sorted[0],
  };
};

export const renderSummary = (scope: AutonomyScope, signals: number): string => `${scope}:${signals}`;

export const toHealthTuple = (
  score: BundleHealth,
): readonly [AutonomyScope, number, number] => [score.topScope, score.score, score.signals];
