import { useMemo } from 'react';
import { SyntheticExecutionTimeline } from '../components/SyntheticExecutionTimeline';
import { SyntheticOrchestrationDashboard } from '../components/SyntheticOrchestrationDashboard';
import { SyntheticPluginRail } from '../components/SyntheticPluginRail';
import { useRecoverySyntheticOrchestrationWorkspace } from '../hooks/useRecoverySyntheticOrchestrationWorkspace';

export const RecoverySyntheticOrchestrationPage = () => {
  const workspace = useRecoverySyntheticOrchestrationWorkspace({
    tenantId: 'tenant-synthetic',
    workspaceId: 'workspace-console',
  });

  const selectedPhaseText = useMemo(
    () => `selected=${workspace.selected ?? 'none'}`,
    [workspace.selected],
  );

  return (
    <main>
      <h1>Recovery Synthetic Orchestration</h1>
      <p>{selectedPhaseText}</p>
      <SyntheticOrchestrationDashboard
        runs={workspace.runs}
        loading={workspace.loading}
        seedRunId={workspace.seedRunId}
        selected={workspace.selected}
        actions={workspace.actions}
      />
      <SyntheticPluginRail runs={workspace.runs} />
      <SyntheticExecutionTimeline runId={workspace.selected} />
    </main>
  );
};
