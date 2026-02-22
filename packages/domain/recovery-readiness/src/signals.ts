import type { ReadinessSignal, RecoveryReadinessPlan, RiskBand, ReadinessTarget } from './types';

export interface SignalEnvelope {
  signal: ReadinessSignal;
  weight: number;
  context?: Record<string, string>;
}

export interface SignalSummary {
  runId: ReadinessSignal['runId'];
  totalsBySource: Record<ReadinessSignal['source'], number>;
  totalsBySeverity: Record<ReadinessSignal['severity'], number>;
  maxSeverity: ReadinessSignal['severity'];
  weightedScore: number;
  riskBand: RiskBand;
}

function severityWeight(severity: ReadinessSignal['severity']): number {
  switch (severity) {
    case 'low':
      return 1;
    case 'medium':
      return 2.5;
    case 'high':
      return 5;
    case 'critical':
      return 12;
    default:
      return 1;
  }
}

export function foldSignals(signals: ReadinessSignal[]): SignalSummary {
  const totalsBySource = signals.reduce(
    (acc, signal) => {
      acc[signal.source] = (acc[signal.source] ?? 0) + 1;
      return acc;
    },
    {} as Record<ReadinessSignal['source'], number>
  );

  const totalsBySeverity = signals.reduce(
    (acc, signal) => {
      acc[signal.severity] = (acc[signal.severity] ?? 0) + 1;
      return acc;
    },
    {} as Record<ReadinessSignal['severity'], number>
  );

  const maxSeverity =
    signals
      .map((signal) => signal.severity)
      .reduce<ReadinessSignal['severity']>((current, severity) => {
        const order: ReadinessSignal['severity'][] = ['low', 'medium', 'high', 'critical'];
        return order.indexOf(severity) > order.indexOf(current) ? severity : current;
      }, 'low');

  const weightedScore = signals.reduce((total, signal) => {
    return total + severityWeight(signal.severity);
  }, 0);

  const riskBand: RiskBand =
    weightedScore >= 18 ? 'red' : weightedScore >= 9 ? 'amber' : 'green';

  return {
    runId: signals[0]?.runId ?? ('run:unbound' as RecoveryReadinessPlan['runId']),
    totalsBySource,
    totalsBySeverity,
    maxSeverity,
    weightedScore,
    riskBand
  };
}

export function toSignalEnvelopes(signals: ReadinessSignal[]): SignalEnvelope[] {
  return signals.map((signal) => ({
    signal,
    weight: severityWeight(signal.severity),
    context: {
      normalizedAt: new Date(signal.capturedAt).toISOString(),
      category: signal.source
    }
  }));
}

export function targetCriticalityScore(target: ReadinessTarget): number {
  switch (target.criticality) {
    case 'critical':
      return 100;
    case 'high':
      return 60;
    case 'medium':
      return 30;
    case 'low':
      return 10;
    default:
      return 0;
  }
}
