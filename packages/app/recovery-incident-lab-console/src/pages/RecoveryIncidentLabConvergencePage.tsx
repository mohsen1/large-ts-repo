import { type ReactElement, useMemo } from 'react';
import { RecoveryLabConvergenceTimeline } from '../components/RecoveryLabConvergenceTimeline';
import { RecoveryLabConvergencePanel } from '../components/RecoveryLabConvergencePanel';
import { useRecoveryLabConvergence } from '../hooks/useRecoveryLabConvergence';

const formatMode = (mode: string): string => mode.replace(/_/g, ' ');

export const RecoveryIncidentLabConvergencePage = (): ReactElement => {
  const {
    state,
    run,
    reset,
    setMode,
    adjustSeed,
    mode,
    seed,
    topology,
  } = useRecoveryLabConvergence();

  const topRows = useMemo(() => {
    return topology.nodes
      .map((node) => node.name)
      .sort()
      .toReversed()
      .slice(0, 8)
      .join(', ');
  }, [topology.nodes]);

  const footerDiagnostics = useMemo(() => {
    if (state.diagnostics.length > 0) {
      return state.diagnostics;
    }

    return [`run:${state.stage}`, `seed:${seed}`, `mode:${mode}`];
  }, [state.diagnostics, state.stage, seed, mode]);

  return (
    <main className="recovery-incident-lab-convergence-page">
      <header>
        <h1>Recovery Incident Lab Convergence</h1>
        <p>
          tenant topology nodes: {topology.nodes.length}, edges: {topology.edges.length}
        </p>
        <p>{topRows}</p>
      </header>
      <section className="recovery-incident-lab-convergence-controls">
        <div className="mode-row">
          <label>
            mode
            <select
              value={mode}
              onChange={(event) => {
                setMode(event.currentTarget.value as 'tenant' | 'topology' | 'signal' | 'policy' | 'fleet');
              }}
            >
              <option value="tenant">tenant</option>
              <option value="topology">topology</option>
              <option value="signal">signal</option>
              <option value="policy">policy</option>
              <option value="fleet">fleet</option>
            </select>
          </label>
          <span>seed: {seed}</span>
          <button type="button" onClick={() => adjustSeed(-1)}>
            -
          </button>
          <button type="button" onClick={() => adjustSeed(1)}>
            +
          </button>
        </div>
        <div className="run-row">
          <button type="button" onClick={run} disabled={state.stage === 'running'}>
            run convergence
          </button>
          <button type="button" onClick={reset}>
            reset
          </button>
          <span>status: {state.stage}</span>
          <span>templates: {state.templates}</span>
        </div>
        <div className="meta-row">
          <p>formatted mode: {formatMode(mode)}</p>
          <p>runId: {state.runId ?? 'n/a'}</p>
          <p>started: {state.startedAt ?? 'n/a'}</p>
          <p>ended: {state.endedAt ?? 'n/a'}</p>
          <p>topology size: {state.topologySize}</p>
        </div>
      </section>
      <section className="metrics-row">
        <RecoveryLabConvergenceTimeline
          output={state.output}
          onJumpToStage={(target) => {
            void target;
          }}
        />
      </section>
      <section className="metrics-row">
        <RecoveryLabConvergencePanel
          output={state.output}
          stageTrail={state.rows.map((row) => row.stage)}
          manifestCount={state.templates}
          onAction={({ command, payload }) => {
            if (command === 'reset') {
              reset();
            } else if (command === 'jump' && payload) {
              void payload;
            }
          }}
        />
      </section>
      <section className="diagnostics-row">
        <h2>Diagnostics</h2>
        <ul>
          {footerDiagnostics.map((entry, index) => (
            <li key={`${entry}-${index}`}>{entry}</li>
          ))}
        </ul>
      </section>
    </main>
  );
};
