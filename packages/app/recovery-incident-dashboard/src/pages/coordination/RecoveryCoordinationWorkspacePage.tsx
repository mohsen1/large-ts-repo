import { useMemo } from 'react';
import { CoordinationWorkbench } from '../../components/coordination/CoordinationWorkbench';
import { CoordinationSignalsPanel } from '../../components/coordination/CoordinationSignalsPanel';
import { CoordinationCadenceBoard } from '../../components/coordination/CoordinationCadenceBoard';
import { useCoordinationCommandCenter } from '../../hooks/coordination/useCoordinationCommandCenter';

export const RecoveryCoordinationWorkspacePage = () => {
  const {
    state,
    selection,
    commandInputs,
    latestReport,
    launch,
    cancel,
    reload,
  } = useCoordinationCommandCenter({ tenant: 'global', programId: 'coord-global' });

  const signals = useMemo(() => {
    const fromSelection = selection
      ? [
          ...selection.reasons,
          ...selection.blockedConstraints,
          `decision:${selection.decision}`,
        ]
      : ['no-selection'];

    return fromSelection.map((entry, index) => {
      const severity: 'low' | 'medium' | 'high' = index % 3 === 0 ? 'high' : index % 3 === 1 ? 'medium' : 'low';

      return {
        source: state.tenant,
        severity,
        title: entry,
        createdAt: `${index}`,
      };
    });
  }, [selection, state.tenant]);

  return (
    <main className="recovery-coordination-workspace-page">
      <header>
        <h1>Recovery Coordination Workspace</h1>
        <p>
          commands={commandInputs.length} runId={latestReport?.runId ?? 'none'}
        </p>
      </header>
      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <CoordinationWorkbench
          state={state}
          signals={signals}
          onRun={() => {
            void launch();
          }}
          onCancel={cancel}
        />
        <CoordinationSignalsPanel report={latestReport} selectedSignals={state.selectedSignals} />
      </section>
      <CoordinationCadenceBoard
        history={latestReport ? [latestReport] : []}
        routeStates={latestReport
          ? [
              {
                tenant: latestReport.tenant,
                runId: latestReport.runId,
                stage: latestReport.state.phase === 'delivery' ? 'select' : 'execute',
                queuedAt: latestReport.state.startedAt,
                startedAt: latestReport.state.lastUpdatedAt,
                completedAt: latestReport.selection.decision === 'approved' ? new Date().toISOString() : undefined,
              },
            ]
          : []}
      />
      <button onClick={reload}>Refresh</button>
    </main>
  );
};
