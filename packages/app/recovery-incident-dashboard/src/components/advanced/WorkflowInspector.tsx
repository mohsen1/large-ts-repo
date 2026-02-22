import { useMemo, useState } from 'react';
import type { DashboardIncident, DashboardRunState, DashboardPlanState } from '../../types';
import { useRecoveryWorkflow } from '../../hooks/useRecoveryWorkflow';
import { RecoveryIncidentRepository } from '@data/recovery-incident-store';

export interface WorkflowInspectorProps {
  readonly repository: RecoveryIncidentRepository;
  readonly incidents: readonly DashboardIncident[];
  readonly runs: readonly DashboardRunState[];
  readonly plans: readonly DashboardPlanState[];
}

interface RunCluster {
  readonly runId: string;
  readonly runCount: number;
  readonly failedCount: number;
  readonly ratio: number;
}

export const WorkflowInspector = ({ repository, incidents, runs, plans }: WorkflowInspectorProps) => {
  const [expanded, setExpanded] = useState(false);
  const { sendCommand } = useRecoveryWorkflow(repository);

  const clusters = useMemo<RunCluster[]>(() => {
    const grouped = new Map<string, DashboardRunState[]>();
    for (const run of runs) {
      const bucket = run.state;
      const values = grouped.get(bucket) ?? [];
      values.push(run);
      grouped.set(bucket, values);
    }

    return Array.from(grouped.entries()).map(([state, entries]) => {
      const failures = entries.filter((entry) => entry.state === 'failed').length;
      const ratio = Number((entries.length === 0 ? 0 : (1 - failures / entries.length)).toFixed(4));
      return {
        runId: state,
        runCount: entries.length,
        failedCount: failures,
        ratio,
      };
    });
  }, [runs]);

  const planIndex = useMemo(() => {
    const map = new Map<string, number>();
    for (const plan of plans) {
      map.set(String(plan.planId), plan.runCount);
    }
    return map;
  }, [plans]);

  const healthy = useMemo(() => clusters.every((entry) => entry.ratio > 0.5), [clusters]);

  const triggerRepair = async (incidentId: string) => {
    await sendCommand({
      tenantId: incidents[0]?.scope?.tenantId ?? 'default',
      incidentId,
      command: 'promote',
      correlationId: `inspector:${incidentId}`,
      reason: 'workflow-inspector',
    });
  };

  return (
    <section className="workflow-inspector">
      <h2>Workflow Inspector</h2>
      <p>Healthy: {String(healthy)}</p>
      <button onClick={() => setExpanded((current) => !current)}>
        {expanded ? 'Collapse' : 'Expand'}
      </button>
      <ul>
        {clusters.map((cluster) => (
          <li key={cluster.runId}>
            <span>{cluster.runId}</span>
            <span>runs: {cluster.runCount}</span>
            <span>failed: {cluster.failedCount}</span>
            <span>ratio: {cluster.ratio}</span>
          </li>
        ))}
      </ul>
      {expanded && (
        <div className="plan-index">
          {incidents.slice(0, 5).map((incident) => {
            const runCount = planIndex.get(String(incident.id)) ?? 0;
            const canRepair = runCount > 0;
            return (
              <article key={String(incident.id)}>
                <h3>{incident.title}</h3>
                <p>Severity: {incident.severity}</p>
                <p>Recent runs: {runCount}</p>
                <button
                  onClick={() => {
                    if (canRepair) {
                      void triggerRepair(String(incident.id));
                    }
                  }}
                  disabled={!canRepair}
                >
                  Promote recovery
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
