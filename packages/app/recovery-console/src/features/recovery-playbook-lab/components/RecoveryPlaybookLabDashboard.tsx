import type { CandidateRow, TelemetryRow } from '../types';

interface Props {
  readonly title: string;
  readonly candidates: readonly CandidateRow[];
  readonly telemetry: readonly TelemetryRow[];
  readonly onRun: (playbookId: string) => void;
}

const panel = {
  display: 'grid',
  gap: '0.85rem',
  borderRadius: '1rem',
  padding: '0.9rem',
  border: '1px solid rgba(148,163,184,0.2)',
  background: 'rgba(15,23,42,0.7)',
};

const row = {
  borderRadius: '0.55rem',
  padding: '0.55rem',
  background: 'rgba(30,41,59,0.8)',
  border: '1px solid rgba(148,163,184,0.2)',
};

export const RecoveryPlaybookLabDashboard = ({ title, candidates, telemetry, onRun }: Props) => {
  return (
    <section style={panel}>
      <header>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <p style={{ margin: 0, color: '#94a3b8' }}>
          candidates={candidates.length} telemetry={telemetry.length}
        </p>
      </header>

      <section style={{ display: 'grid', gap: '0.5rem' }}>
        {candidates.slice(0, 8).map((candidate) => (
          <article key={candidate.id} style={row}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem' }}>
              <strong>{candidate.title}</strong>
              <span style={{ color: '#93c5fd' }}>{candidate.score.toFixed(1)}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, auto)', gap: '0.75rem', color: '#cbd5e1' }}>
              <span>{candidate.timeMinutes}m est</span>
              <span>{candidate.confidence}% conf</span>
              <span>{candidate.status}</span>
              <span>{candidate.lane}</span>
            </div>
            <button
              onClick={() => {
                onRun(candidate.id);
              }}
              type="button"
              style={{ marginTop: '0.5rem' }}
            >
              execute
            </button>
          </article>
        ))}
      </section>

      <section style={{ display: 'grid', gap: '0.4rem' }}>
        <h4 style={{ margin: '0.25rem 0' }}>Latest signals</h4>
        {telemetry.slice(0, 4).map((item) => (
          <p key={`${item.runId}:${item.at}`} style={{ margin: 0, color: '#bfdbfe' }}>
            run={item.runId} score={item.score.toFixed(2)} lane={item.lane} latency={item.latencyMs}ms dry-run={String(item.dryRun)}
          </p>
        ))}
      </section>
    </section>
  );
};
