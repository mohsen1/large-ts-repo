import { useMemo } from 'react';
import type { OrchestratorHookState, OrchestratorHookActions, StressRouteBinding } from '../hooks/useIncidentOrchestratorStress';
import { routeRouteFromBinding } from '../hooks/useIncidentOrchestratorStress';

export interface IncidentOrchestratorStressPanelProps {
  readonly state: OrchestratorHookState;
  readonly actions: OrchestratorHookActions;
}

const statusClass = (status: OrchestratorHookState['status']) => {
  if (status === 'done') {
    return 'stress-panel status-done';
  }
  if (status === 'running') {
    return 'stress-panel status-running';
  }
  if (status === 'error') {
    return 'stress-panel status-error';
  }
  return 'stress-panel status-idle';
};

const describeBinding = (binding: StressRouteBinding): string => {
  if (binding.family === 'incident') {
    return `${binding.family}:${binding.action}:${binding.id}`;
  }
  if (binding.family === 'workflow') {
    return `${binding.action}-${binding.id}`.toUpperCase();
  }
  return `${binding.family}-${binding.action}`;
};

export const IncidentOrchestratorStressPanel = ({ state, actions }: IncidentOrchestratorStressPanelProps) => {
  const bindingsByStatus = useMemo(() => {
    const rows = state.routeBindings.map((binding, index) => ({
      index,
      route: routeRouteFromBinding(binding),
      summary: describeBinding(binding),
      status: state.branchStates[index]?.status ?? 'ignore',
    }));

    return rows.reduce(
      (
        groups: Record<string, typeof rows>,
        row,
      ) => {
        const group = groups[row.status] ?? [];
        group.push(row);
        groups[row.status] = group;
        return groups;
      },
      {} as Record<string, typeof rows>,
    );
  }, [state.branchStates, state.routeBindings]);

  return (
    <section className={statusClass(state.status)}>
      <header>
        <h2>Incident Orchestrator Stress Panel</h2>
        <div className="panel-meta">
          <span>Seed: {state.seed}</span>
          <span>Status: {state.status}</span>
          <button onClick={() => void actions.run()}>Run</button>
          <button onClick={actions.reset}>Reset</button>
        </div>
      </header>
      <article className="panel-body">
        {state.errorMessage ? <p className="error">{state.errorMessage}</p> : null}
        <div className="branch-groups">
          {Object.entries(bindingsByStatus).map(([status, rows]) => (
            <div key={status}>
              <h3>{status}</h3>
              <ul>
                {rows.map((row) => (
                  <li key={`${row.status}-${row.index}`}>
                    <button onClick={() => actions.select(row.index)} type="button">
                      {row.summary}
                    </button>
                    <small>{row.route}</small>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <section className="selected-branch">
          {state.selected ? (
            <p>
              Selected branch: {state.selected.status} weight {state.selected.weight}
            </p>
          ) : (
            <p>No branch selected</p>
          )}
        </section>
      </article>
    </section>
  );
};
