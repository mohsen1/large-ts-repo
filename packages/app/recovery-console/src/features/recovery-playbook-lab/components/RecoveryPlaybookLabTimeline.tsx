import type { TelemetryRow } from '../types';

const timelineContainer = {
  borderRadius: '0.9rem',
  padding: '0.85rem',
  border: '1px solid rgba(148,163,184,0.2)',
  background: 'rgba(2,6,23,0.8)',
};

const block = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr 1fr 1fr',
  gap: '0.6rem',
};

export const RecoveryPlaybookLabTimeline = ({ telemetry }: { telemetry: readonly TelemetryRow[] }) => {
  return (
    <section style={timelineContainer}>
      <h3 style={{ marginTop: 0 }}>Execution timeline</h3>
      <div style={block}>
        {telemetry.map((entry) => (
          <article key={`${entry.runId}:${entry.at}`}>
            <p style={{ margin: '0 0 0.2rem', fontSize: '0.75rem', color: '#94a3b8' }}>{entry.at}</p>
            <p style={{ margin: 0, color: '#e2e8f0' }}>{entry.runId}</p>
            <p style={{ margin: '0.2rem 0', color: '#22d3ee' }}>{entry.lane}</p>
            <p style={{ margin: 0, color: '#facc15' }}>{entry.score.toFixed(2)} points</p>
          </article>
        ))}
      </div>
    </section>
  );
};
