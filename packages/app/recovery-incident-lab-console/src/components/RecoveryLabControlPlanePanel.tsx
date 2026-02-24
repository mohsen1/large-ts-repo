import { type ReactElement, useMemo } from 'react';
import { useRecoveryLabControlPlane } from '../hooks/useRecoveryLabControlPlane';
import { RecoveryLabRegistryViewer } from './RecoveryLabRegistryViewer';

const StatusBadge = ({
  mode,
  status,
}: {
  readonly mode: 'ready' | 'running' | 'idle' | 'error';
  readonly status: string;
}): ReactElement => {
  const style = useMemo(
    () => ({
      color: mode === 'error' ? 'tomato' : mode === 'running' ? 'orange' : mode === 'ready' ? 'green' : 'gray',
    }),
    [mode],
  );

  return (
    <p style={style}>
      control-plane status: <strong>{status}</strong>
    </p>
  );
};

const CommandRow = ({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement => (
  <li>
    <strong>{label}:</strong> {value}
  </li>
);

export const RecoveryLabControlPlanePanel = (): ReactElement => {
  const { state, snapshot, canRun, status, events, run, reset } = useRecoveryLabControlPlane();
  const scenarioId = state.scenarioId;

  return (
    <section className="recovery-lab-control-plane-panel">
      <header>
        <h2>Recovery Lab Control Plane</h2>
        <p>Workspace: {state.workspaceId}</p>
        <p>Scenario: {scenarioId ?? 'not loaded'}</p>
        <StatusBadge mode={state.mode} status={status} />
      </header>
      <ul>
        <CommandRow label="Stage" value={state.stage} />
        <CommandRow label="Plan" value={state.planId ?? 'none'} />
        <CommandRow label="Mode" value={snapshot.mode} />
        <CommandRow label="Events" value={snapshot.eventCount.toString()} />
        <CommandRow label="Dispatch label" value={snapshot.label} />
        <CommandRow label="Policy count" value={state.policies.length.toString()} />
      </ul>
      <div className="control-plane-actions">
        <button type="button" onClick={() => void run()} disabled={!canRun}>
          run control-plane
        </button>
        <button type="button" onClick={reset}>
          reset
        </button>
      </div>
      <RecoveryLabRegistryViewer timeline={events} />
      <section>
        <h3>Diagnostics</h3>
        <ul>
          {state.diagnostics.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
      </section>
      <section>
        <h3>Timeline warnings</h3>
        <ul>
          {state.timelineWarnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </section>
    </section>
  );
};
