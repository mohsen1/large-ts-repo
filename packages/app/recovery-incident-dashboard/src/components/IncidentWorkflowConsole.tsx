import { useMemo, useState } from 'react';
import type { RecoveryIncidentRepository } from '@data/recovery-incident-store';
import { useIncidentDashboard } from '../hooks/useIncidentDashboard';
import { useIncidentWorkflowGraph } from '../hooks/useIncidentWorkflowGraph';
import type { IncidentPlan } from '@domain/recovery-incident-orchestration';

interface IncidentWorkflowConsoleProps {
  readonly repository: RecoveryIncidentRepository;
  readonly tenantId: string;
}

interface SelectedPlan {
  readonly planId: string;
  readonly runNodeId: string;
}

export const IncidentWorkflowConsole = ({ repository, tenantId }: IncidentWorkflowConsoleProps) => {
  const { state, actions } = useIncidentDashboard(repository);
  const [activePlan, setActivePlan] = useState<SelectedPlan | null>(null);
  const selectedIncident = useMemo(() => state.incidents[0], [state.incidents]);
  const workflowHook = useIncidentWorkflowGraph(
    repository,
    {
      tenantId,
      maxResults: 6,
      incident: selectedIncident
        ? {
            ...selectedIncident,
            severity: selectedIncident.severity,
            scope: selectedIncident.scope,
            labels: [...selectedIncident.labels],
            title: selectedIncident.title,
            summary: selectedIncident.summary,
            snapshots: selectedIncident.snapshots,
            signals: selectedIncident.signals,
            metadata: { ...selectedIncident.metadata },
            openedAt: selectedIncident.openedAt,
            resolvedAt: selectedIncident.resolvedAt,
            detectedAt: selectedIncident.detectedAt,
            id: selectedIncident.id,
          }
        : {
            id: 'missing:incident' as never,
            severity: 'medium',
            title: 'No incident',
            summary: 'Waiting for source data',
            scope: {
              tenantId,
              clusterId: 'default',
              region: 'us-east-1',
              serviceName: 'recovery-dashboard',
            },
            labels: ['empty'],
            openedAt: new Date().toISOString(),
            detectedAt: new Date().toISOString(),
            snapshots: [],
            signals: [],
            metadata: {},
            resolvedAt: undefined,
          },
    },
  );

  const onPlan = async () => {
    const bundle = await workflowHook.plan();
    if (!bundle) {
      return;
    }
    setActivePlan({
      planId: bundle.template.id,
      runNodeId: bundle.template.route.nodes[0]?.id ?? 'init',
    });
  };

  const onRun = async () => {
    if (!activePlan || !selectedIncident) {
      return;
    }
    const incidentId = await workflowHook.runNode(activePlan.planId, activePlan.runNodeId);
    if (incidentId) {
      await actions.execute(incidentId);
    }
  };

  const onPromote = async () => {
    if (!selectedIncident) {
      return;
    }
    const latestPlan = state.plans.at(-1);
    if (!latestPlan) {
      return;
    }
    const ok = await workflowHook.promote(selectedIncident.id, latestPlan.planId as IncidentPlan['id']);
    if (ok) {
      setActivePlan({
        planId: String(latestPlan.planId),
        runNodeId: 'final',
      });
    }
  };

  const status = workflowHook.state.summary.bundleCount === 0
    ? 'idle'
    : workflowHook.state.loading
      ? 'working'
      : 'ready';

  return (
    <section className="incident-workflow-console">
      <header>
        <h2>Workflow Console</h2>
        <p>Status: {status}</p>
        <p>Bundles: {workflowHook.state.summary.bundleCount}</p>
        <p>Run records: {workflowHook.state.summary.runCount}</p>
      </header>
      <div className="workflow-actions">
        <button onClick={() => void actions.refresh()}>Refresh</button>
        <button onClick={() => void onPlan()}>Build Workflow</button>
        <button onClick={() => void onRun()}>Execute Workflow</button>
        <button onClick={() => void onPromote()}>Promote Plan</button>
      </div>
      <ul>
        {workflowHook.state.bundles.map((bundle) => (
          <li key={String(bundle.template.id)}>
            <strong>{bundle.template.title}</strong>
            <p>Routes: {bundle.template.route.nodes.length}</p>
            <p>Runs: {bundle.runs.length}</p>
            <p>State: {bundle.instance.status}</p>
          </li>
        ))}
      </ul>
      {workflowHook.state.errors.length > 0 ? (
        <ul className="workflow-errors">
          {workflowHook.state.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};
