import { useMemo } from 'react';

import type { StudioSummary } from '../../services/commandStudioAdapter';

interface CommandStudioReadinessPanelProps {
  readonly summary: StudioSummary;
}

const readinessColor = (ratio: number): string => {
  if (ratio >= 0.8) return '#16a34a';
  if (ratio >= 0.6) return '#ca8a04';
  return '#dc2626';
};

export const CommandStudioReadinessPanel = ({ summary }: CommandStudioReadinessPanelProps) => {
  const statusRatio = useMemo(() => {
    if (summary.totalRuns === 0) return 0;
    return summary.activeCount / summary.totalRuns;
  }, [summary]);

  const latest = useMemo(() => summary.timeline.at(-1), [summary.timeline]);

  return (
    <aside className="command-studio-readiness-panel">
      <h3>Readiness</h3>
      <p>{summary.workspaceId}</p>
      <div style={{ color: readinessColor(statusRatio) }}>{`Active ratio ${(statusRatio * 100).toFixed(1)}%`}</div>
      <ul>
        <li>Total Runs: {summary.totalRuns}</li>
        <li>Active Runs: {summary.activeCount}</li>
      </ul>
      <div>
        {latest ? (
          <dl>
            <dt>Latest step</dt>
            <dd>{latest.nodeId}</dd>
            <dt>Blockers</dt>
            <dd>{latest.blockerCount}</dd>
            <dt>Metrics</dt>
            <dd>{latest.metricCount}</dd>
          </dl>
        ) : (
          <p>No timeline points yet</p>
        )}
      </div>
    </aside>
  );
};
