import { WorkbenchControlPanel } from '../components/WorkbenchControlPanel';
import { WorkbenchDiagnosticsDeck } from '../components/WorkbenchDiagnosticsDeck';
import { WorkbenchTimelineDeck } from '../components/WorkbenchTimelineDeck';
import { useRecoveryWorkbenchOrchestration } from '../hooks/useRecoveryWorkbenchOrchestration';
import { WorkbenchRunSummary } from '../components/WorkbenchRunSummary';
import { WorkbenchTraceTimeline } from '../components/WorkbenchTraceTimeline';
import { type ReactElement } from 'react';

interface RecoveryWorkbenchOrchestrationPageProps {
  readonly tenant: string;
  readonly workspace: string;
}

export const RecoveryWorkbenchOrchestrationPage = ({ tenant, workspace }: RecoveryWorkbenchOrchestrationPageProps): ReactElement => {
  const { loading, snapshots, selectedRoute, results, run, clear, setRoute } =
    useRecoveryWorkbenchOrchestration({ tenant, workspace });

  const summary = {
    snapshots,
    results,
    selectedRoute,
    loading,
  };

  return (
    <main>
      <section>
        <h1>Recovery Workbench Orchestration</h1>
        <p>{`active route: ${selectedRoute}`}</p>
      </section>

      <WorkbenchControlPanel
        control={{
          loading,
          refreshing: false,
          snapshots,
          selectedRoute,
          results,
        }}
        onRouteChange={setRoute}
        onRun={run}
      />

      <section>
        <button type="button" onClick={run} disabled={loading}>
          {loading ? 'Running workbench...' : 'Start Workbench Run'}
        </button>
        <button type="button" onClick={clear} disabled={loading}>
          Clear history
        </button>
      </section>

      <WorkbenchTimelineDeck snapshots={snapshots} />
      <WorkbenchDiagnosticsDeck results={results} />
      <WorkbenchRunSummary {...summary} />
      <WorkbenchTraceTimeline snapshots={snapshots} />
    </main>
  );
};

export default RecoveryWorkbenchOrchestrationPage;
