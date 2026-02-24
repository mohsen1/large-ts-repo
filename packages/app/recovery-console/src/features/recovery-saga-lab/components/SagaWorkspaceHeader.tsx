import { useMemo } from 'react';
import type { SagaWorkspaceState } from '../types';
import type { ReactElement } from 'react';

interface Props {
  readonly state: SagaWorkspaceState;
  readonly summary: string;
  readonly onRefresh: () => void;
  readonly onTab: (tab: string) => void;
}

export const SagaWorkspaceHeader = ({ state, summary, onRefresh, onTab }: Props): ReactElement => {
  const statusLabel = useMemo(() => {
    const status = state.loading ? 'loading' : state.error ? 'error' : 'ready';
    const last = state.lastSummary ? ` • ${state.lastSummary}` : '';
    return `${status}${last}`;
  }, [state.error, state.lastSummary, state.loading]);

  return (
    <section className="saga-workspace-header">
      <div className="saga-workspace-title">
        <h2>{state.run?.id ?? 'incident saga lab'}</h2>
        <p>{summary}</p>
        <small>{statusLabel}</small>
      </div>
      <div className="saga-workspace-tabs">
        {['timeline', 'topology', 'policies', 'events'].map((tab) => (
          <button
            type="button"
            key={tab}
            onClick={() => onTab(tab)}
            aria-pressed={state.selectedTab === tab}
            className={state.selectedTab === tab ? 'active' : undefined}
          >
            {tab}
          </button>
        ))}
      </div>
      <button type="button" onClick={onRefresh}>
        refresh
      </button>
    </section>
  );
};
