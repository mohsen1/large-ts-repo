import { Fragment, useMemo } from 'react';
import { ControlPlaneManifestPanel } from '../components/control-plane/ControlPlaneManifestPanel';
import { ControlPlaneCommandTimeline } from '../components/control-plane/ControlPlaneCommandTimeline';
import { useAdaptiveControlPlane } from '../hooks/useAdaptiveControlPlane';

const routeByState = (state: 'reactive' | 'planned' | 'defensive'): string =>
  state === 'reactive'
    ? 'critical response'
    : state === 'planned'
      ? 'planned response'
      : 'defensive sweep';

const rowClass = (status: 'idle' | 'running' | 'errored' | 'done'): string =>
  status === 'running' ? 'running' : status === 'done' ? 'done' : status === 'errored' ? 'bad' : 'idle';

export const RecoveryOperationsControlPlanePage = () => {
  const { state, run, clear, setTenant, setUrgency, setLookback, setMaxRoutes, runSummary } = useAdaptiveControlPlane();

  const planStatus = useMemo(
    () => ({
      running: state.running,
      rows: state.rows,
      manifest: Boolean(state.manifest),
    }),
    [state.rows, state.running, state.manifest],
  );

  const urgencyOptions = useMemo(() => ['reactive', 'planned', 'defensive'] as const, []);
  const maxRouteOptions = useMemo(() => [6, 12, 18, 24], []);

  const footer = useMemo(() => {
    const rowCount = planStatus.rows.length;
    const gates = state.plan?.gates.length ?? 0;
    const window = state.plan?.window.to ?? '';
    return `${rowCount} rows / ${gates} gates / window ${window}`;
  }, [planStatus.rows.length, state.plan?.gates.length, state.plan?.window.to]);

  return (
    <main className="recovery-operations-control-plane-page">
      <header>
        <h1>Recovery Operations Control Plane</h1>
        <p>{runSummary}</p>
        <p>{routeByState(state.summary.urgency)}</p>
      </header>

      <section className="control-plane-toolbar">
        <label>
          Tenant
          <input
            value={state.summary.tenant}
            onChange={(event) => {
              setTenant(event.target.value);
            }}
          />
        </label>
        <label>
          Urgency
          <select
            value={state.summary.urgency}
            onChange={(event) => {
              setUrgency(event.target.value as 'reactive' | 'planned' | 'defensive');
            }}
          >
            {urgencyOptions.map((urgency) => (
              <option key={urgency} value={urgency}>
                {urgency}
              </option>
            ))}
          </select>
        </label>
        <label>
          Lookback
          <input
            type="number"
            min={1}
            max={120}
            value={state.summary.lookbackMinutes}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              setLookback(Number.isFinite(parsed) ? parsed : 1);
            }}
          />
        </label>
        <label>
          Max routes
          <select
            value={state.summary.maxRoutes}
            onChange={(event) => {
              setMaxRoutes(Number(event.target.value));
            }}
          >
            {maxRouteOptions.map((maxRoutes) => (
              <option key={maxRoutes} value={maxRoutes}>
                {maxRoutes}
              </option>
            ))}
          </select>
        </label>

        <div className="control-actions">
          <button type="button" onClick={run} disabled={state.running}>
            {state.running ? 'Running…' : 'Run control plane'}
          </button>
          <button type="button" onClick={clear}>
            Reset
          </button>
        </div>
      </section>

      {state.lastError ? <p className="error">{state.lastError}</p> : null}

      <section className="control-plane-summary-grid">
        <article>
          <h3>State</h3>
          <p>running: {String(planStatus.running)}</p>
          <p>tenant: {state.summary.tenant}</p>
          <p>rows: {planStatus.rows.length}</p>
          <p>manifest present: {String(planStatus.manifest)}</p>
          <p>window minutes: {state.summary.lookbackMinutes}</p>
          <p>plan route mode: {routeByState(state.summary.urgency)}</p>
        </article>

        <article>
          <h3>Log</h3>
          <ul>
            {state.logs.map((entry, index) => (
              <li key={`${index}-${entry}`}>{entry}</li>
            ))}
          </ul>
          <p>{footer}</p>
        </article>
      </section>

      {state.manifest ? <ControlPlaneManifestPanel manifest={state.manifest} /> : null}

      {state.manifest && state.plan ? (
        <section className="control-plane-commands">
          <h3>Routes</h3>
          <ControlPlaneCommandTimeline
            routes={state.plan.gates.map((gate, index) => ({
              routeId: `${String(state.plan?.id)}-route-${index}`,
              topic: gate,
              tenant: state.summary.tenant,
              payload: { gate },
            }))}
            commands={state.plan.commands}
            onRefresh={run}
          />

          <h3>Rows</h3>
          <table>
            <thead>
              <tr>
                <th>Id</th>
                <th>Status</th>
                <th>Commands</th>
                <th>Gates</th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map((row) => (
                <tr key={row.id} className={rowClass(row.status)}>
                  <td>{row.id}</td>
                  <td>{row.status}</td>
                  <td>{row.commandCount}</td>
                  <td>{row.gateCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="control-plane-debug">
        <details>
          <summary>Raw diagnostics</summary>
          <pre>{JSON.stringify(state, null, 2)}</pre>
        </details>
      </section>
    </main>
  );
};
