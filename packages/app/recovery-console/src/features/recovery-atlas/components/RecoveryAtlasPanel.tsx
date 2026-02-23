import { useMemo } from 'react';
import type { RecoveryAtlasSnapshot, RecoveryAtlasRunReport } from '@domain/recovery-operations-atlas';
import type { RecoveryAtlasWorkspaceState } from '../hooks/useRecoveryAtlasWorkspace';
import type { RecoveryAtlasIncidentId, RecoveryAtlasWindowId } from '@domain/recovery-operations-atlas';

interface RecoveryAtlasPanelProps {
  readonly state: RecoveryAtlasWorkspaceState;
  readonly snapshots: readonly RecoveryAtlasSnapshot[];
  readonly onSelectWindow: (id: RecoveryAtlasWindowId) => void;
  readonly onSelectIncident: (id: RecoveryAtlasIncidentId) => void;
}

interface SnapshotMetric {
  readonly snapshotId: RecoveryAtlasWindowId;
  readonly incidentId: RecoveryAtlasIncidentId;
  readonly planCount: number;
  readonly status: 'ok' | 'warn' | 'fail';
}

const computeStatus = (snapshot: RecoveryAtlasSnapshot, report?: RecoveryAtlasRunReport): 'ok' | 'warn' | 'fail' => {
  if (snapshot.plans.length === 0) return 'fail';
  if (!report) return 'warn';
  return report.passed ? 'ok' : 'fail';
};

export const RecoveryAtlasPanel = ({
  state,
  snapshots,
  onSelectWindow,
  onSelectIncident,
}: RecoveryAtlasPanelProps) => {
  const metrics = useMemo(() => {
    return snapshots.map((snapshot): SnapshotMetric => {
      const report = state.activeReport;
      const status = computeStatus(snapshot, report);
      return {
        snapshotId: snapshot.id,
        incidentId: snapshot.incidentId,
        planCount: snapshot.plans.length,
        status,
      };
    });
  }, [snapshots, state.activeReport]);

  return (
    <section className="recovery-atlas-panel">
      <header>
        <h2>Recovery Atlas Workspace</h2>
        <p>{state.tenantId}</p>
      </header>
      <div>
        <p>Snapshots: {state.snapshots.length}</p>
        <p>Runbook: {state.runbookState}</p>
        <p>Ready: {state.isReady ? 'yes' : 'no'}</p>
      </div>
      <ul>
        {metrics.map((metric) => (
          <li key={metric.snapshotId}>
            <button type="button" onClick={() => onSelectWindow(metric.snapshotId)}>
              Open {metric.snapshotId}
            </button>
            <button type="button" onClick={() => onSelectIncident(metric.incidentId)}>
              Focus incident
            </button>
            <span>
              {metric.planCount} plans
            </span>
            <strong>{metric.status}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
};
