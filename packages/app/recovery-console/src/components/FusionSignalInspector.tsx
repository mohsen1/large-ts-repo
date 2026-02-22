import { useMemo } from 'react';
import type { FusionSignalEnvelope } from '../hooks/useRecoveryFusionSignals';

export interface FusionSignalInspectorProps {
  readonly tenant: string;
  readonly signals: readonly FusionSignalEnvelope[];
  readonly summary: readonly string[];
}

const signalSeverityClass = (severity: number): string => {
  if (severity >= 8) return 'critical';
  if (severity >= 6) return 'high';
  if (severity >= 4) return 'medium';
  return 'low';
};

export const FusionSignalInspector = ({ tenant, signals, summary }: FusionSignalInspectorProps) => {
  const totals = useMemo(() => {
    const counts: Record<'critical' | 'high' | 'medium' | 'low', number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
    for (const entry of signals) {
      const signal = entry.signal;
      const band = signalSeverityClass(signal.severity);
      if (band === 'critical' || band === 'high' || band === 'medium' || band === 'low') {
        counts[band] += 1;
      }
    }
    return counts;
  }, [signals]);

  return (
    <section className="fusion-signal-inspector">
      <h2>Signal inspector · {tenant}</h2>
      <div className="signal-summary">
        <p>Critical: {totals.critical}</p>
        <p>High: {totals.high}</p>
        <p>Medium: {totals.medium}</p>
        <p>Low: {totals.low}</p>
        <p>Total: {signals.length}</p>
      </div>
      <ul>
        {summary.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <ol>
        {signals.slice(0, 25).map((entry) => (
          <li key={entry.id}>
            <strong>{entry.signal.source}</strong> #{entry.signal.id} severity {entry.signal.severity} confidence {entry.signal.confidence}
          </li>
        ))}
      </ol>
    </section>
  );
};
