import { useCallback, useMemo } from 'react';
import { IncidentOrchestrationStudioBoard } from '../components/IncidentOrchestrationStudioBoard';
import { IncidentOrchestrationPlaybookPanel } from '../components/IncidentOrchestrationPlaybookPanel';
import { IncidentOrchestrationSignalPanel } from '../components/IncidentOrchestrationSignalPanel';
import { useIncidentOrchestrationStudio } from '../hooks/useIncidentOrchestrationStudio';

export const IncidentOrchestrationStudioPage = () => {
  const state = useIncidentOrchestrationStudio();

  const selectedSeed = useMemo(
    () => ({
      tenantId: 'tenant-omega',
      incidentId: 'incident-omega-1',
      operatorId: 'operator-omega',
    }),
    [],
  );

  const onRun = useCallback(async () => {
    await state.execute(selectedSeed);
  }, [state, selectedSeed]);

  return (
    <main style={{ padding: '1rem', color: '#e2e8f0', display: 'grid', gap: '1rem' }}>
      <section style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="button" onClick={onRun} style={{ borderRadius: 8, padding: '0.5rem 0.75rem' }} disabled={state.runState.status === 'running'}>
          Run orchestration
        </button>
        <button type="button" onClick={state.clear} style={{ borderRadius: 8, padding: '0.5rem 0.75rem' }}>
          Clear
        </button>
      </section>
      <IncidentOrchestrationStudioBoard
        workspace={state.workspace}
        diagnosticsText={state.diagnosticsText}
        runState={state.runState}
      />
      <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: '2fr 1fr' }}>
        <IncidentOrchestrationPlaybookPanel
          snapshot={state.workspace?.snapshot}
          approval={state.runState.status === 'complete' ? state.runState.output.policy.approved : false}
          onSelectBest={() => {
            // Intentionally no-op: action is tracked via diagnostics and telemetry output.
          }}
        />
        <IncidentOrchestrationSignalPanel
          events={state.signalEvents}
          isStreaming={state.signalStreaming}
          phaseCounts={state.signalPhaseCounts}
          onClear={state.clear}
        />
      </div>
      <footer style={{ border: '1px solid #334155', borderRadius: 10, padding: '0.7rem', color: '#94a3b8' }}>
        <p style={{ margin: 0 }}>Last run: {state.workspace?.id ?? 'none'}</p>
      </footer>
    </main>
  );
};

export default IncidentOrchestrationStudioPage;
