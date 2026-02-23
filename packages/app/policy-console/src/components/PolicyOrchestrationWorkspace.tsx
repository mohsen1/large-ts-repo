import { FormEvent, useMemo } from 'react';
import { ConsoleWorkspaceState } from '../hooks/usePolicyConsoleWorkspace';

interface PolicyOrchestrationWorkspaceProps {
  state: ConsoleWorkspaceState;
  onRefresh: () => void;
  onRunDry: (id: string) => void;
  onRunLive: (id: string) => void;
  onSetQuery: (query: string) => void;
  onClearError: () => void;
}

export const PolicyOrchestrationWorkspace = ({
  state,
  onRefresh,
  onRunDry,
  onRunLive,
  onSetQuery,
  onClearError,
}: PolicyOrchestrationWorkspaceProps) => {
  const selectedCount = useMemo(() => state.artifacts.filter((artifact) => artifact.state === 'active').length, [state.artifacts]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    onRefresh();
  };

  return (
    <section>
      <header>
        <h2>Policy Orchestration Workspace</h2>
        <p>Active artifacts: {selectedCount}</p>
      </header>
      <form onSubmit={onSubmit}>
        <input
          type="text"
          value={state.query}
          onChange={(event) => onSetQuery(event.target.value)}
          placeholder="Search artifacts"
        />
        <button type="submit">Refresh</button>
      </form>
      {state.error && (
        <div>
          <p>{state.error}</p>
          <button onClick={onClearError}>Clear</button>
        </div>
      )}
      {state.isLoading ? (
        <p>loading...</p>
      ) : (
        <ul>
          {state.artifacts.map((artifact) => {
            const active = state.activeArtifactId === artifact.artifactId;
            return (
              <li key={artifact.id} style={{ marginBottom: '0.75rem' }}>
                <strong>{artifact.name}</strong>
                <p>{artifact.payload ? JSON.stringify(artifact.payload) : 'no payload'}</p>
                <p>state={artifact.state}</p>
                <div>
                  <button onClick={() => onRunDry(artifact.artifactId)}>Dry Run</button>
                  <button onClick={() => onRunLive(artifact.artifactId)} disabled={state.runMode === 'full'}>
                    {state.runMode === 'full' ? 'Running...' : 'Run'}
                  </button>
                </div>
                {active ? <span>active</span> : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
