import { type ReactElement } from 'react';
import { RecoveryLabPluginControlPanel } from '../components/RecoveryLabPluginControlPanel';
import { RecoveryLabPluginPolicyMatrix } from '../components/RecoveryLabPluginPolicyMatrix';
import { useRecoveryLabPluginOrchestrator } from '../hooks/useRecoveryLabPluginOrchestrator';

const TimelinePanel = ({
  reports,
}: {
  readonly reports: ReturnType<typeof useRecoveryLabPluginOrchestrator>['state']['reports'];
}): ReactElement => (
  <section className="recovery-lab-plugin-timeline">
    <h3>Execution Timeline</h3>
    <ul>
      {reports.flatMap((report, index) =>
        report.steps.map((step, stepIndex) => (
          <li key={`${index}:${String(step.manifestId)}:${stepIndex}`}>
            <span>{`${step.stage}`}</span>
            <strong>{String(step.manifestId)}</strong>
            <em>{step.startedAt}</em>
          </li>
        )),
      )}
    </ul>
  </section>
);

const ReportHeader = ({
  namespace,
  tenantId,
  state,
}: {
  namespace: string;
  tenantId: string;
  state: ReturnType<typeof useRecoveryLabPluginOrchestrator>['state'];
}): ReactElement => (
  <header className="recovery-lab-plugin-page-header">
    <h1>Plugin Orchestrator</h1>
    <p>{tenantId}</p>
    <p>{namespace}</p>
    <p>{state.status}</p>
  </header>
);

export const RecoveryLabPluginOrchestrationPage = (): ReactElement => {
  const { state, run, changeKind, seedKinds } = useRecoveryLabPluginOrchestrator();

  return (
    <main className="recovery-lab-plugin-orchestration-page">
      <ReportHeader namespace={state.namespace} tenantId={state.tenantId} state={state} />
      {state.plan && (
        <section className="recovery-lab-plugin-plan-summary">
          <h2>Plan summary</h2>
          <p>{`Specs: ${state.plan.specs}`}</p>
          <p>{`Edges: ${state.plan.edges}`}</p>
          <ul>
            {state.plan.timeline.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </section>
      )}
      <RecoveryLabPluginControlPanel state={state} seedKinds={seedKinds} onRun={run} onSelectKind={changeKind} />
      <RecoveryLabPluginPolicyMatrix state={state} />
      <TimelinePanel reports={state.reports} />
      <section>
        <h3>Debug</h3>
        <pre>{JSON.stringify(state, null, 2)}</pre>
      </section>
    </main>
  );
};
