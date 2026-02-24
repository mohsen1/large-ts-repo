import { Fragment } from 'react';
import { type StressLabOrchestratorReport } from '@service/recovery-stress-lab-orchestrator';
import { type LatticeRunEnvelope } from '@data/recovery-stress-lab-orchestration-store';

interface StressLabOrchestrationDeckProps {
  readonly sessions: readonly LatticeRunEnvelope[];
  readonly report: StressLabOrchestratorReport | null;
  readonly status: 'idle' | 'running' | 'ready' | 'error';
  readonly onRefresh: () => Promise<void>;
  readonly onReset: () => void;
}

export const StressLabOrchestrationDeck = ({
  sessions,
  report,
  status,
  onRefresh,
  onReset,
}: StressLabOrchestrationDeckProps) => {
  const hasSignal = sessions.length > 0;

  return (
    <section style={{ display: 'grid', gap: '0.75rem', border: '1px solid #334155', borderRadius: 12, padding: '1rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
        <h3 style={{ margin: 0 }}>Stress Lab Orchestration Deck</h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" onClick={onRefresh} disabled={status === 'running'}>
            {status === 'running' ? 'Running…' : 'Run orchestration'}
          </button>
          <button type="button" onClick={onReset}>
            Reset
          </button>
        </div>
      </header>

      <p style={{ margin: 0, color: '#94a3b8' }}>
        {status === 'error' ? 'Last run reported an error.' : `Status: ${status}`}
      </p>

      <div style={{ borderRadius: 8, border: '1px solid #1f2937', padding: '0.65rem', background: '#0f172a' }}>
        <strong>Current manifest</strong>
        <p style={{ margin: '0.25rem 0' }}>
          {report ? `forecast points: ${report.forecast.total}` : 'No active manifest'}
        </p>
        <p style={{ margin: '0.25rem 0', color: '#94a3b8' }}>
          {report
            ? `recommendations=${report.recommendationCount} snapshots=${report.envelope.snapshots.length}`
            : 'Run a scenario to materialize recommendations'}
        </p>
      </div>

      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {hasSignal ? (
          sessions.map((session) => {
            const digest = session.planDigest;
            const snapshotCount = session.snapshots.length;

            return (
              <article key={session.sessionId} style={{ border: '1px solid #1f2937', borderRadius: 8, padding: '0.5rem' }}>
                <h4 style={{ margin: '0 0 0.25rem' }}>Session {session.sessionId}</h4>
                <p style={{ margin: '0 0 0.25rem', color: '#94a3b8' }}>{digest}</p>
                <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem', fontSize: '0.86rem' }}>
                  <dt>Snapshots</dt>
                  <dd>{snapshotCount}</dd>
                  <dt>Simulation digest</dt>
                  <dd>{session.simulationDigest}</dd>
                  <dt>Tenant</dt>
                  <dd>{session.tenantId}</dd>
                </dl>
              </article>
            );
          })
        ) : (
          <p style={{ margin: 0, color: '#94a3b8' }}>No stored sessions yet.</p>
        )}
      </div>
    </section>
  );
};
