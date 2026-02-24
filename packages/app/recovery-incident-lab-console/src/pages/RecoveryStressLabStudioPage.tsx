import { type ReactElement } from 'react';
import { RecoveryStressLabStudioControls } from '../components/RecoveryStressLabStudioControls';
import { RecoveryStressLabStudioSummary } from '../components/RecoveryStressLabStudioSummary';
import { RecoveryStressLabStudioTimeline } from '../components/RecoveryStressLabStudioTimeline';
import { useRecoveryStressLabStudio } from '../hooks/useRecoveryStressLabStudio';

export const RecoveryStressLabStudioPage = (): ReactElement => {
  const {
    addSignal,
    history,
    input,
    payload,
    run,
    reset,
    state,
    updateTenant,
    summary,
  } = useRecoveryStressLabStudio();

  return (
    <main className="recovery-stress-lab-studio-page">
      <h1>Recovery Stress Lab Studio</h1>
      <RecoveryStressLabStudioControls
        canRun={state.signals.length > 0 && input.runbooks.length > 0}
        disabled={state.stage === 'running'}
        onTenant={updateTenant}
        onRun={run}
        onReset={reset}
        onAddSignal={addSignal}
      />
      <RecoveryStressLabStudioSummary
        planCount={state.planCount}
        signalCount={state.signals.length}
        simulationSummary={state.simulationSummary}
        payload={payload}
        summary={summary}
      />
      <RecoveryStressLabStudioTimeline
        title={`tenant=${input.tenantId}`}
        result={state.result}
      />
      <section>
        <h2>Telemetry history</h2>
        <p>signature: {history.signature}</p>
        <ul>
          {history.events.map((entry) => (
            <li key={`${entry.at}-${entry.planSet}`}>
              {entry.at} · {entry.stage} · planIndex={entry.planSet}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
};
