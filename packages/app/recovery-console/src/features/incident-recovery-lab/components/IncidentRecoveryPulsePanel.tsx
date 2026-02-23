import { useMemo } from 'react';
import { useIncidentRecoveryPulse } from '../hooks/useIncidentRecoveryPulse';
import type { RecoveryLabScenario } from '../types';

interface IncidentRecoveryPulsePanelProps {
  readonly scenario: RecoveryLabScenario;
}

const asPercent = (value: number): string => `${Math.round(value * 100)}%`;

export const IncidentRecoveryPulsePanel = ({ scenario }: IncidentRecoveryPulsePanelProps) => {
  const { incidents, selectedId, risk, autoCloseCount, running, refresh, select, runSimulation } = useIncidentRecoveryPulse(scenario);

  const sorted = useMemo(() => [...incidents].sort((left, right) => left.serviceId.localeCompare(right.serviceId)), [incidents]);

  return (
    <section style={{ border: '1px solid #334155', borderRadius: 12, padding: '1rem', background: '#0f172a', color: '#e2e8f0' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem' }}>
        <h2 style={{ margin: 0 }}>Incident Recovery Pulse</h2>
        <button type="button" onClick={() => void refresh()} disabled={running} style={{ borderRadius: 6 }}>
          {running ? 'syncing...' : 'Refresh'}
        </button>
      </header>
      <p style={{ marginTop: '0.5rem', color: '#94a3b8' }}>
        Auto-closeable incidents: {autoCloseCount}, risk score: {asPercent(risk / 100)}.
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
        {sorted.map((incident) => {
          const isSelected = incident.id === selectedId;
          return (
            <li
              key={incident.id}
              style={{
                display: 'grid',
                gap: '0.25rem',
                border: `1px solid ${isSelected ? '#22d3ee' : '#334155'}`,
                borderRadius: 8,
                padding: '0.6rem',
              }}
            >
              <strong>{incident.title}</strong>
              <span>{incident.serviceId}</span>
              <span>state: {incident.state}</span>
              <span>severity: {incident.triage.severity}</span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" onClick={() => select(incident.id)} style={{ borderRadius: 6 }}>
                  Select
                </button>
                <button
                  type="button"
                  onClick={() => void runSimulation(incident.id)}
                  disabled={running}
                  style={{ borderRadius: 6 }}
                >
                  Simulate
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
