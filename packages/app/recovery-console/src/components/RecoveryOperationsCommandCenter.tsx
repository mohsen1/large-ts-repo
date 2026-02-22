import { useMemo } from 'react';
import { useRecoveryOperationsCommandCenter } from '../hooks/useRecoveryOperationsCommandCenter';

export const RecoveryOperationsCommandCenter = () => {
  const workspace = useRecoveryOperationsCommandCenter();

  const latestLines = useMemo(() => {
    const events = workspace.state.commandRequests;
    return events.map((entry, index) => `${index + 1}. ${entry}`);
  }, [workspace.state.commandRequests]);

  return (
    <section className="recovery-operations-command-center">
      <header>
        <h2>Recovery command center</h2>
        <p>Tenant: {workspace.state.tenant}</p>
      </header>

      <div className="toolbar">
        <button type="button" onClick={() => workspace.ingest([
          {
            id: `sample-${Date.now()}`,
            source: 'controller',
            severity: 7,
            confidence: 0.8,
            detectedAt: new Date().toISOString(),
            details: { source: 'ui', synthetic: true },
          },
        ])}>
          Ingest sample signal
        </button>
        <button type="button" onClick={() => void workspace.runCommandCenter()} disabled={workspace.state.busy || workspace.signalCount === 0}>
          Run command center
        </button>
        <button type="button" onClick={workspace.clear}>
          Clear
        </button>
      </div>

      {workspace.state.error && <p className="error">{workspace.state.error}</p>}

      <p>Signals loaded: {workspace.signalCount}</p>
      <p>State: {workspace.state.busy ? 'running' : 'ready'}</p>

      <article>
        <h3>Summary</h3>
        <p>{workspace.state.lastSummary || 'No summary yet'}</p>
      </article>

      <article>
        <h3>Forecast</h3>
        <p>{workspace.state.lastForecast || 'No forecast yet'}</p>
      </article>

      <article>
        <h3>Analytics</h3>
        <p>{workspace.state.lastAnalytics || 'No analytics yet'}</p>
      </article>

      <article>
        <h3>Graph</h3>
        <pre>{workspace.state.lastGraph || 'No graph yet'}</pre>
      </article>

      <ol>
        {latestLines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>
    </section>
  );
};
