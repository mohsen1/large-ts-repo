import { useMemo, type ReactElement } from 'react';
import type { LatticeOrchestratorState } from '@service/recovery-lattice-orchestrator';

type Props = {
  readonly state: LatticeOrchestratorState;
  readonly onActivate: (id: string) => void;
  readonly selected: string;
};

const statusColor = (status: LatticeOrchestratorState['status']): string => {
  if (status === 'complete') return '#3bd17a';
  if (status === 'validation_failed') return '#fd8a67';
  if (status === 'initialized') return '#77a5ff';
  return '#d8d8d8';
};

const shortId = (id: string): string => id.split(':').at(-1) ?? id;

const inferPath = (events: readonly string[]): readonly string[] => {
  const list = events.map((entry) => entry.split(':')).toSorted();
  return list.map((parts) => parts.at(-1) ?? 'event');
};

export const LatticeExecutionStepper = ({
  state,
  onActivate,
  selected,
}: Props): ReactElement => {
  const logs = useMemo(
    () => inferPath(state.logs.map((entry) => `${entry.type}:${entry.id}`)),
    [state.logs],
  );

  return (
    <section className="lattice-stepper">
      <header>
        <h3>Execution Stepper</h3>
        <strong style={{ color: statusColor(state.status) }}>{state.status}</strong>
      </header>

      <ol className="step-grid">
        {logs.length > 0 ? (
          logs.map((log, index) => (
            <li key={`${index}-${log}`} className={selected === log ? 'selected' : ''}>
              <button type="button" onClick={() => onActivate(log)}>
                {shortId(log)}
              </button>
              <small>{index + 1}</small>
            </li>
          ))
        ) : (
          <li className="empty">Waiting for execution events</li>
        )}
      </ol>

      <footer>
        <p>request: {shortId(state.requestId)}</p>
        <p>tenant: {state.tenantId}</p>
      </footer>
    </section>
  );
};
