import { useMemo } from 'react';
import type { CoordinationDashboardState, CoordinationSignal } from '../../types/coordination/coordinationDashboard';

export interface CoordinationWorkbenchProps {
  readonly state: CoordinationDashboardState;
  readonly signals: readonly CoordinationSignal[];
  readonly onRun: () => void;
  readonly onCancel: (commandId: string) => void;
}

export const CoordinationWorkbench = ({ state, signals, onRun, onCancel }: CoordinationWorkbenchProps) => {
  const summary = useMemo(() => {
    const selected = state.candidate;
    if (!selected) return 'No active candidate';
    return `Candidate ${selected.id} metadata=${selected.metadata.parallelism}p/${selected.metadata.expectedCompletionMinutes}m`;
  }, [state.candidate]);

  return (
    <section className="coordination-workbench">
      <header>
        <h2>Coordination Workbench</h2>
        <p>{summary}</p>
      </header>
      <div>
        <button disabled={!state.canExecute || state.isBusy} onClick={onRun}>
          Execute
        </button>
        <button
          disabled={!state.canCancel}
          onClick={() => onCancel(state.program ? state.program.id : 'none')}
        >
          Cancel
        </button>
      </div>
      <ul>
        {signals.map((signal) => (
          <li key={`${signal.source}:${signal.createdAt}`}>
            <strong>{signal.title}</strong> [{signal.severity}] from {signal.source}
          </li>
        ))}
      </ul>
      <div>
        <p>Program present: {Boolean(state.program).toString()}</p>
        <p>Latest run: {state.latestReport?.runId ?? 'none'}</p>
      </div>
    </section>
  );
};
