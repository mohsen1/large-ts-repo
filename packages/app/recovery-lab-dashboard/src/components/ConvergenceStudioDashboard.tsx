import { useMemo } from 'react';
import { useConvergenceStudioSession } from '../hooks/useConvergenceStudioSession';
import type { ConvergenceSummary } from '@domain/recovery-ops-orchestration-lab/src/convergence-studio/types';

type ConvergenceStudioDashboardProps = {
  readonly tenant: string;
  readonly mode?: 'live' | 'dry-run' | 'replay';
};

export const ConvergenceStudioDashboard = ({ tenant, mode = 'live' }: ConvergenceStudioDashboardProps) => {
  const { state, start, checkpoints, pluginDigest, reset } = useConvergenceStudioSession({ tenant, mode });
  const checkpointsList = useMemo(
    () =>
      checkpoints.map((checkpoint) => `${checkpoint.label}: ${typeof checkpoint.value === 'object' ? JSON.stringify(checkpoint.value) : String(checkpoint.value)}`),
    [checkpoints],
  );

  const body = useMemo(() => {
    if (state.status === 'loading') {
      return <p>starting convergence run</p>;
    }
    if (state.status === 'error') {
      return <p style={{ color: '#991b1b' }}>{state.message}</p>;
    }
    if (state.status === 'ready') {
      return (
        <pre style={{ background: '#f8fafc', padding: 12, borderRadius: 8 }}>
          {JSON.stringify(
            {
              runId: String(state.payload.envelope.runId),
              status: state.payload.report.status,
              elapsed: state.payload.report.elapsedMs,
              stageCount: state.payload.payload.activeStages.length,
              lifecycle: state.payload.payload.lifecycle,
            },
            null,
            2,
          )}
        </pre>
      );
    }

    return <p>ready for execution</p>;
  }, [state]);

  const checkpointSummary = useMemo(() => {
    if (checkpoints.length === 0) {
      return 'no checkpoints yet';
    }
    return `${checkpoints.length} checkpoints`;
  }, [checkpoints.length]);

  const summary: ConvergenceSummary | null = state.status === 'ready' ? state.payload.payload.summary : null;
  const timelineSummary = summary ? summary.diagnostics.join(' | ') : '—';

  return (
    <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3>Convergence Studio</h3>
          <small>{pluginDigest}</small>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={start} disabled={state.status === 'loading'}>
            {state.status === 'loading' ? 'running…' : 'run'}
          </button>
          <button type="button" onClick={reset} disabled={state.status === 'idle'}>
            reset
          </button>
        </div>
      </header>
      <p>{checkpointSummary}</p>
      <p>{timelineSummary}</p>
      <ul style={{ margin: '8px 0', paddingLeft: 16, maxHeight: 120, overflowY: 'auto' }}>
        {checkpointsList.map((entry) => (
          <li key={entry}>{entry}</li>
        ))}
      </ul>
      {body}
    </section>
  );
};
