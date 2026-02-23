import { useMemo } from 'react';
import { StreamStressLabWorkspace } from '../types/stressLab';

export interface StressLabWorkspaceBoardProps {
  workspace: StreamStressLabWorkspace;
  onRequestRefresh: () => void;
}

export function StressLabWorkspaceBoard({ workspace, onRequestRefresh }: StressLabWorkspaceBoardProps) {
  const summary = useMemo(() => {
    const status = workspace.plan ? 'planned' : 'unplanned';
    const simulationStatus = workspace.simulation ? 'simulated' : 'not-simulated';
    const risk = workspace.simulation ? workspace.simulation.riskScore : 0;
    const sla = workspace.simulation ? workspace.simulation.slaCompliance : 0;
    return { status, simulationStatus, risk, sla };
  }, [workspace.plan, workspace.simulation]);

  return (
    <section>
      <header>
        <h3>Stress Lab Workspace</h3>
      </header>
      <p>Tenant: {workspace.tenantId}</p>
      <p>Plan status: {summary.status}</p>
      <p>Simulation: {summary.simulationStatus}</p>
      <p>Signals: {workspace.runbookSignals.length}</p>
      <p>Runbooks: {workspace.runbooks.length}</p>
      <p>Band: {workspace.configBand} · Risk: {summary.risk.toFixed(3)} · SLA: {summary.sla.toFixed(3)}</p>
      <button type="button" onClick={onRequestRefresh}>
        Refresh
      </button>
      <ul>
        {workspace.targets.slice(0, 5).map((target) => (
          <li key={target.workloadId}>
            {target.name} · criticality {target.criticality}
          </li>
        ))}
      </ul>
    </section>
  );
}
