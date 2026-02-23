import type { PlaybookState } from '../hooks/useRecoveryOpsPlaybook';

interface RiskTag {
  label: string;
  weight: number;
  tone: 'green' | 'amber' | 'red';
}

interface DashboardProps {
  readonly state: PlaybookState;
  readonly onRefresh: () => void;
  readonly onRerun: () => void;
}

const toneFromWeight = (weight: number): RiskTag['tone'] => {
  if (weight > 80) {
    return 'red';
  }
  if (weight > 55) {
    return 'amber';
  }
  return 'green';
};

const renderMetric = (label: string, value: string, tone: RiskTag['tone']) => {
  const color = {
    green: '#0ea5e9',
    amber: '#f59e0b',
    red: '#ef4444',
  }[tone];

  return (
    <div style={{
      border: `1px solid ${color}`,
      borderRadius: '0.75rem',
      padding: '0.75rem',
      minWidth: 150,
      background: 'linear-gradient(180deg, rgba(15,23,42,0.2), rgba(15,23,42,0))',
    }}>
      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{label}</div>
      <div style={{ fontSize: '1.25rem', fontWeight: 700, color }}>{value}</div>
    </div>
  );
};

export const RecoveryOpsPlaybookDashboard = ({ state, onRefresh, onRerun }: DashboardProps) => {
  const score =
    state.snapshot?.run
      ? Math.round((state.snapshot.projection.confidence ?? 0) * 100)
      : 0;

  const lastTrace = state.snapshot?.trace?.[state.snapshot.trace.length - 1];

  const tags: RiskTag[] = [
    { label: 'Confidence', weight: score, tone: toneFromWeight(score) },
    { label: 'Traces', weight: state.snapshot ? state.snapshot.trace.length * 10 : 0, tone: toneFromWeight(state.snapshot?.trace.length ?? 0 * 10) },
    { label: 'History', weight: state.runHistory.length * 20, tone: toneFromWeight(Math.min(100, state.runHistory.length * 20)) },
  ];

  return (
    <section style={{
      padding: '1rem',
      borderRadius: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem',
      background: 'linear-gradient(140deg, rgba(15,23,42,0.7), rgba(30,41,59,0.5))',
      color: '#e2e8f0',
      border: '1px solid rgba(148,163,184,0.15)',
    }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: '1.125rem' }}>Recovery Playbook Control Room</h2>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={onRefresh} style={{ borderRadius: 999, border: '1px solid #475569', background: '#0f172a', color: '#e2e8f0', padding: '0.5rem 0.85rem' }}>
            Refresh
          </button>
          <button onClick={onRerun} style={{ borderRadius: 999, border: '1px solid #22d3ee', background: '#0f172a', color: '#e2e8f0', padding: '0.5rem 0.85rem' }}>
            Re-run
          </button>
        </div>
      </header>
      <p style={{ color: '#cbd5e1', margin: 0 }}>
        {state.error ? state.error : `Orchestration status: ${state.status}`}
      </p>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        {tags.map((tag) => (
          <div key={tag.label}>
            {renderMetric(tag.label, `${tag.weight.toFixed(0)}%`, tag.tone)}
          </div>
        ))}
      </div>
      <article style={{
        padding: '0.75rem',
        border: '1px solid rgba(148,163,184,0.25)',
        borderRadius: '0.8rem',
        background: 'rgba(15,23,42,0.35)',
      }}>
        <h3 style={{ marginTop: 0 }}>Active run trace</h3>
        <div style={{ color: '#94a3b8' }}>
          {state.snapshot ? (
            <>
              <div>Playbook: {state.snapshot.playbookId}</div>
              <div>Run ID: {state.snapshot.runId}</div>
              <div>Last trace: {lastTrace ? lastTrace.action : 'none'}</div>
            </>
          ) : (
            <span>Awaiting run data</span>
          )}
        </div>
      </article>
    </section>
  );
};
