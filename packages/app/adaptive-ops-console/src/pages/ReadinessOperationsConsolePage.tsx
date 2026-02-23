import { useState } from 'react';
import { ReadinessCommandStrip } from '../components/readiness/ReadinessCommandStrip';
import { ReadinessSignalBoard } from '../components/readiness/ReadinessSignalBoard';
import { ReadinessHeatMap } from '../components/readiness/ReadinessHeatMap';
import { useReadinessConsole } from '../hooks/useReadinessConsole';

export const ReadinessOperationsConsolePage = () => {
  const { state, runBootstrap, runReconcile, refresh, setTenantId, setSignals, setAuto, reset } = useReadinessConsole();
  const [selectedRun, setSelectedRun] = useState('');
  const signals = state.runs.map((run) => run.summary.length);
  const logs = state.logs;

  const summary = `${state.status?.policy ?? 'not-ready'} / snapshots ${state.status?.snapshots ?? 0}`;

  return (
    <main className="readiness-operations-console-page">
      <header>
        <h1>Readiness Operations Console</h1>
        <p>{summary}</p>
        {state.lastError ? <p className="error">Error: {state.lastError}</p> : null}
      </header>

      <ReadinessCommandStrip
        runs={state.runs}
        onBootstrap={() => {
          void runBootstrap();
        }}
        onReconcile={() => {
          void runReconcile();
        }}
        onRefresh={() => {
          void refresh();
        }}
      />

      <label>
        Tenant
        <input
          value={selectedRun || 'tenant-a'}
          onChange={(event) => {
            const value = event.target.value || 'tenant-a';
            setSelectedRun(value);
            setTenantId(value);
          }}
        />
      </label>
      <label>
        Signal count
        <input
          type="number"
          min={1}
          max={40}
          value={state.form.signals}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            setSignals(Number.isFinite(parsed) ? parsed : 12);
          }}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={state.form.includeAuto}
          onChange={(event) => {
            setAuto(event.target.checked);
          }}
        />
        include synthetic signal prefixes
      </label>

      <section className="readiness-ops-body">
        <ReadinessSignalBoard
          runs={state.runs}
          selectedRunId={selectedRun}
          onSelect={(runId) => {
            setSelectedRun(runId);
          }}
        />

        <ReadinessHeatMap
          title="Signal summary by run"
          values={signals}
          max={Math.max(...signals, 1)}
        />

        <section className="command-log">
          <h3>Activity log</h3>
          <ul>
            {logs.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
          <button type="button" onClick={reset}>
            reset
          </button>
        </section>
      </section>
    </main>
  );
};

