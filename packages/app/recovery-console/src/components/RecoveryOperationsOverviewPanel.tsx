import { useMemo } from 'react';

import type { RecoveryOpsWorkspaceState } from '../hooks/useRecoveryOpsWorkspace';
import { useRecoveryOpsReadinessBoard } from '../hooks/useRecoveryOpsReadinessBoard';

interface RecoveryOperationsOverviewPanelProps {
  readonly workspace: RecoveryOpsWorkspaceState;
  readonly onRefresh: () => void;
}

const readinessBanner = (score: number): 'green' | 'yellow' | 'red' => {
  if (score >= 0.7) return 'green';
  if (score >= 0.4) return 'yellow';
  return 'red';
};

export const RecoveryOperationsOverviewPanel = ({ workspace, onRefresh }: RecoveryOperationsOverviewPanelProps) => {
  const readinessBoard = useRecoveryOpsReadinessBoard(workspace.tenant);
  const avgReadiness = useMemo(() => {
    if (!readinessBoard.routes.length) return 0;
    const sum = readinessBoard.routes.reduce((acc, route) => acc + route.score, 0);
    return Number((sum / readinessBoard.routes.length).toFixed(3));
  }, [readinessBoard.routes]);

  return (
    <section className="operations-overview">
      <header>
        <h2>Operations Overview</h2>
        <p>{workspace.workspaceId}</p>
        <button type="button" onClick={onRefresh}>
          Refresh
        </button>
      </header>
      <div>
        <p>Tenant: {workspace.tenant}</p>
        <p>Plans: {workspace.planCount}</p>
        <p>Surface Score: {(workspace.commandSurfaceScore * 100).toFixed(2)}</p>
        <p>Matrix Risk: {(workspace.matrixRiskScore * 100).toFixed(2)}</p>
        <p>Signal Digest: {workspace.signalDigest || 'none'}</p>
        <p>Readiness color: {readinessBanner(avgReadiness)}</p>
        <p>Recommendation: {workspace.recommendation}</p>
      </div>
      <ul>
        {readinessBoard.routes.map((route) => (
          <li key={route.planId}>
            {route.planId} score={route.score.toFixed(2)} risk={route.risk}
          </li>
        ))}
      </ul>
      <p>Board generated at: {readinessBoard.generatedAt || 'n/a'}</p>
    </section>
  );
};
