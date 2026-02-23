import { useMemo } from 'react';
import { useIncidentRecoveryCadence } from '../hooks/useIncidentRecoveryCadence';
import type { RecoveryLabScenario } from '../types';

interface IncidentRecoveryTimelineProps {
  readonly scenario: RecoveryLabScenario;
}

const styleForScore = (score: number): string => {
  if (score >= 220) return '#22c55e';
  if (score >= 140) return '#f59e0b';
  return '#ef4444';
};

export const IncidentRecoveryTimeline = ({ scenario }: IncidentRecoveryTimelineProps) => {
  const { rows, totalDelay, ready, applyCadence, reset } = useIncidentRecoveryCadence(scenario);

  const labels = useMemo(() => rows.map((entry) => `#${entry.index + 1}`), [rows]);

  return (
    <section style={{ border: '1px solid #334155', borderRadius: 12, padding: '1rem', color: '#e2e8f0', background: '#111827' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
        <h3 style={{ margin: 0 }}>Recovery Cadence Timeline</h3>
        <span style={{ color: '#94a3b8' }}>Total delay {totalDelay}s</span>
      </header>
      <div style={{ marginTop: '0.75rem', color: ready ? '#22c55e' : '#f97316' }}>
        {ready ? 'Cadence ready' : 'Cadence pending'}
      </div>
      <ol style={{ marginTop: '0.5rem', paddingLeft: '1.1rem', display: 'grid', gap: '0.65rem' }}>
        {rows.map((row) => (
          <li key={row.index} style={{ display: 'grid', gap: '0.15rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{labels[row.index]}</strong>
              <span style={{ color: styleForScore(row.score) }}>{row.score}</span>
            </div>
            <progress max={300} value={row.score} style={{ width: '100%', accentColor: styleForScore(row.score) }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#94a3b8' }}>
              <span>delay: {row.delaySeconds}s</span>
              <button type="button" onClick={() => applyCadence(row.index)} style={{ borderRadius: 6 }}>
                tighten
              </button>
            </div>
          </li>
        ))}
      </ol>
      <div style={{ marginTop: '0.6rem' }}>
        <button type="button" onClick={reset} style={{ borderRadius: 6 }}>
          Reset cadence
        </button>
      </div>
    </section>
  );
};
