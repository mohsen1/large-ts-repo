import { RecoveryAtlasPanel } from '../components/RecoveryAtlasPanel';
import { useRecoveryAtlasWorkspace } from '../hooks/useRecoveryAtlasWorkspace';
import { createMockAtlasWorkspaceState } from './mockAtlasData';

export const RecoveryAtlasOrchestrationPage = () => {
  const snapshots = createMockAtlasWorkspaceState();
  const workspace = useRecoveryAtlasWorkspace({
    tenantId: 'tenant-atlas',
    snapshots,
  });

  const selectedWindow = workspace.state.snapshots.find((snapshot) => snapshot.id === workspace.state.selectedWindowId) ??
    workspace.state.snapshots[0];

  return (
    <main className="recovery-atlas-page">
      <section>
        <h1>Recovery atlas orchestration</h1>
        <p>Windows: {workspace.metrics.windowCount}</p>
        <p>Incidents: {workspace.metrics.incidentCount}</p>
        <p>Signature: {workspace.metrics.signature}</p>
      </section>

      <section>
        <button type="button" onClick={workspace.actions.initialize}>
          Initialize plan set
        </button>
        <button type="button" onClick={workspace.actions.run}>
          Simulate run
        </button>
        <button type="button" onClick={workspace.actions.clear}>
          Clear
        </button>
      </section>

      <RecoveryAtlasPanel
        state={workspace.state}
        snapshots={workspace.state.snapshots}
        onSelectWindow={(id) => workspace.actions.selectWindow(id)}
        onSelectIncident={(id) => workspace.actions.selectIncident(id)}
      />

      {workspace.state.activeReport ? (
        <section className="recovery-atlas-report">
          <h2>Run report</h2>
          <p>{workspace.state.activeReport.tenantId}</p>
          <p>{workspace.state.activeReport.planId}</p>
          <p>{workspace.state.activeReport.passed ? 'passed' : 'failed'}</p>
          <p>Completed: {workspace.state.activeReport.completedSteps}</p>
          <p>Failed: {workspace.state.activeReport.failedSteps}</p>
        </section>
      ) : (
        <p>No active report. Pick a run plan first.</p>
      )}

      <section>
        <h3>Selected snapshot</h3>
        <p>{selectedWindow ? selectedWindow.id : 'none'}</p>
        <p>{selectedWindow ? selectedWindow.graph.nodes.length : 0} nodes</p>
        <p>{selectedWindow ? selectedWindow.graph.edges.length : 0} edges</p>
      </section>
    </main>
  );
};
