import { FC } from 'react';
import { SignalSnapshot } from '../hooks/useCockpitReadinessSignals';

export type ReadinessSignalPanelProps = {
  snapshots: ReadonlyArray<SignalSnapshot>;
};

export const ReadinessSignalPanel: FC<ReadinessSignalPanelProps> = ({ snapshots }) => {
  return (
    <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
      <h2>Readiness signals</h2>
      {snapshots.length === 0 ? <p>No signal snapshots yet.</p> : null}
      {snapshots.map((snapshot) => {
        const risk = snapshot.readiness >= 80 ? 'healthy' : snapshot.readiness >= 60 ? 'warning' : 'critical';
        const color = risk === 'healthy' ? '#2f7d32' : risk === 'warning' ? '#f0a700' : '#c62828';
        return (
          <article key={snapshot.planId} style={{ borderBottom: '1px solid #eee', padding: 8 }}>
            <header style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{snapshot.planId}</strong>
              <span style={{ color }}>{risk}</span>
            </header>
            <div>Readiness: {snapshot.readiness}</div>
            <div>Forecast: {snapshot.forecast}</div>
            <div>Policy band: {snapshot.policy}</div>
            <div>
              {snapshot.profile.windows.slice(0, 4).map((window) => (
                <span
                  key={`${snapshot.planId}-${window.at}`}
                  style={{
                    display: 'inline-block',
                    marginRight: 8,
                    background: '#eee',
                    borderRadius: 12,
                    padding: '2px 8px',
                  }}
                >
                  {Math.round(window.score)}
                </span>
              ))}
            </div>
          </article>
        );
      })}
    </section>
  );
};
