import { type ReactElement, useMemo } from 'react';
import { ScenarioLabControls } from '../components/ScenarioLabControls';
import { ScenarioLabTimeline } from '../components/ScenarioLabTimeline';
import { ScenarioLabRiskDashboard } from '../components/ScenarioLabRiskDashboard';
import { useRecoveryIncidentLabWorkspace } from '../hooks/useRecoveryIncidentLabWorkspace';

export const RecoveryIncidentLabConsolePage = (): ReactElement => {
  const { state, plan, launch, validate, summary, statusText } = useRecoveryIncidentLabWorkspace();

  const canRun = useMemo(() => {
    if (!state.scenario || !plan) {
      return false;
    }
    return validate() === 'valid';
  }, [plan, state.scenario, validate]);

  return (
    <main className="recovery-incident-lab-console-page">
      <header>
        <h1>Recovery Incident Lab</h1>
      </header>
      <ScenarioLabRiskDashboard scenario={state.scenario!} plan={plan!} />
      <ScenarioLabControls
        statusText={statusText}
        isBusy={state.mode === 'running'}
        summary={summary}
        canRun={canRun}
        onRun={launch}
        onReset={() => {
          window.location.reload();
        }}
      />
      <ScenarioLabTimeline run={state.output?.run} />
      <section>
        <h2>Plan reasoning</h2>
        <ul>
          {(plan ? ['drafted', 'validated'] : ['waiting']).map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Workspace notes</h2>
        <ul>
          {state.notes.map((note, index) => (
            <li key={`${index}-${note}`}>{note}</li>
          ))}
        </ul>
      </section>
    </main>
  );
};
