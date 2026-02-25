import { useMemo } from 'react';
import { type ScenarioSignal } from '@domain/recovery-scenario-lens';

const severityRank = (signal: ScenarioSignal): number => {
  if (signal.severity === 'critical') {
    return 3;
  }
  if (signal.severity === 'warning') {
    return 2;
  }
  return 1;
};

const formatCell = (input: number): string => `${Math.round(input * 100)}%`;

export interface QuantumSynthesisSignalMatrixProps {
  readonly signals: readonly ScenarioSignal[];
  readonly compact?: boolean;
}

export const QuantumSynthesisSignalMatrix = ({ signals, compact = false }: QuantumSynthesisSignalMatrixProps) => {
  const sorted = useMemo(() => [...signals].sort((left, right) => severityRank(right) - severityRank(left)), [signals]);

  const buckets = useMemo(
    () => [
      sorted.filter((signal) => signal.severity === 'critical'),
      sorted.filter((signal) => signal.severity === 'warning'),
      sorted.filter((signal) => signal.severity === 'info'),
    ],
    [sorted],
  );

  return (
    <section
      style={{
        border: '1px solid #d0d0d0',
        borderRadius: 12,
        padding: 12,
        display: 'grid',
        gap: 12,
      }}
    >
      <h3>Signal Matrix</h3>
      <p style={{ marginTop: 0, opacity: 0.7 }}>
        Severity distribution:
        critical={buckets[0].length},
        warning={buckets[1].length},
        info={buckets[2].length}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr 1fr' }}>
        {buckets.map((bucket, bucketIndex) => (
          <article key={bucketIndex} style={{ border: '1px solid #eee', borderRadius: 8, padding: 10 }}>
            <h4 style={{ marginTop: 0 }}>
              {bucketIndex === 0 ? 'critical' : bucketIndex === 1 ? 'warning' : 'info'}
              ({bucket.length})
            </h4>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {bucket.map((signal, index) => {
                const contextKeys = Object.keys(signal.context);
                return (
                  <li
                    key={`${signal.signalId}-${index}`}
                    style={{ marginBottom: compact ? 4 : 8 }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <strong>{signal.name}</strong>
                      <span>{formatCell(Number(signal.score))}</span>
                    </div>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>{signal.source}</div>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>
                      {contextKeys.join(', ') || 'no context'}
                    </div>
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
};

