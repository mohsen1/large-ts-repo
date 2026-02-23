import { useMemo } from 'react';
import { usePlaybookLab } from '../hooks/usePlaybookLab';
import { PlaybookLabCandidateBoard } from '../components/PlaybookLabCandidateBoard';
import { PlaybookLabControlPanel } from '../components/PlaybookLabControlPanel';
import { PlaybookLabTelemetryPanel } from '../components/PlaybookLabTelemetryPanel';

export const RecoveryPlaybookLabCommandCenter = () => {
  const state = usePlaybookLab();

  const selectedRun = useMemo(() => {
    const latest = state.history.at(0);
    if (!latest) return null;
    return latest.runId;
  }, [state.history]);

  return (
    <main className="playbook-lab-command-center">
      <header>
        <h2>{state.pageTitle}</h2>
      </header>
      <PlaybookLabControlPanel
        state={state}
        onRefresh={state.onRefresh}
        onQueue={state.onQueue}
        onSeed={state.onSeed}
      />
      <PlaybookLabCandidateBoard
        rows={state.rows}
        onRun={() => {
          void state.onQueue();
        }}
        route={{
          tenant: state.config.tenantId,
          lens: 'recovery',
        }}
      />
      <PlaybookLabTelemetryPanel
        rows={state.history}
        onSelectRun={(runId) => {
          void runId;
        }}
      />
      <aside>
        <p>Latest run: {selectedRun ?? 'none'}</p>
      </aside>
    </main>
  );
};
