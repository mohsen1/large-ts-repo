import { useMemo } from 'react';
import { useCognitiveCockpitSignals } from '../../hooks/useCognitiveCockpitSignals';
import { useCognitiveCockpitWorkspace } from '../../hooks/useCognitiveCockpitWorkspace';

export interface CognitiveScenarioPanelProps {
  readonly tenantId: string;
  readonly workspaceId: string;
}

const healthBadge = (health: number): 'critical' | 'warning' | 'healthy' =>
  health > 85 ? 'healthy' : health > 65 ? 'warning' : 'critical';

const toLabel = (value: number): string => `${value.toFixed(1)}%`;

export const CognitiveScenarioPanel = ({ tenantId, workspaceId }: CognitiveScenarioPanelProps) => {
  const { run, loading, runId, timeline } = useCognitiveCockpitSignals({ tenantId, workspaceId });
  const workspace = useCognitiveCockpitWorkspace({ tenantId, workspaceId });

  const status = useMemo(() => healthBadge(workspace.healthScore), [workspace.healthScore]);
  const timelineRows = useMemo(() => {
    return timeline
      .toSorted((left, right) => right.at.localeCompare(left.at))
      .slice(0, 10)
      .map((entry) => (
        <li key={`${entry.at}:${entry.message}`}>
          <time>{entry.at}</time>
          <span>{entry.message}</span>
        </li>
      ));
  }, [timeline]);

  return (
    <aside>
      <header>
        <h2>Workspace scenario panel</h2>
        <p>health: {status}</p>
        <small>score {toLabel(workspace.healthScore)}</small>
      </header>
      <section>
        <p>
          Workspace: {workspace.workspaceId}
          {' '}
          Run:
          {' '}
          {runId ?? 'not-started'}
        </p>
        <p>Top layers: {workspace.topLayers.join(', ') || 'none'}</p>
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            void run();
          }}
        >
          Run scenario
        </button>
      </section>
      <ol>{timelineRows}</ol>
    </aside>
  );
};
