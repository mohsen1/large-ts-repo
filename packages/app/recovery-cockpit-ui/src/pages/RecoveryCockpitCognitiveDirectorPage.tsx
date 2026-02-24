import { useMemo, useState } from 'react';
import { useCognitiveCockpitWorkspace } from '../hooks/useCognitiveCockpitWorkspace';
import { CognitiveWorkflowTimeline } from '../components/cognitive/CognitiveWorkflowTimeline';

export interface RecoveryCockpitCognitiveDirectorPageProps {
  readonly tenantId: string;
  readonly workspaceId: string;
}

const formatLayerLine = (layer: string, count: number) => `${layer.padEnd(10)}${'.'.repeat(count % 40 + 1)}`;

export const RecoveryCockpitCognitiveDirectorPage = ({
  tenantId,
  workspaceId,
}: RecoveryCockpitCognitiveDirectorPageProps) => {
  const workspace = useCognitiveCockpitWorkspace({ tenantId, workspaceId });
  const [expanded, setExpanded] = useState(false);
  const bars = useMemo(() => Object.entries(workspace.metrics.byLayer).map(([layer, count]) => formatLayerLine(layer, count)), [workspace.metrics.byLayer]);

  return (
    <section>
      <header>
        <h1>Cognitive Director Console</h1>
        <p>
          Tenant:
          {' '}
          {tenantId}
          {' '}
          Workspace:
          {' '}
          {workspaceId}
        </p>
      </header>
      <button
        type="button"
        onClick={() => {
          void workspace.refresh();
        }}
      >
        Re-read workspace
      </button>
      <button type="button" onClick={() => setExpanded((next) => !next)}>
        {expanded ? 'Hide details' : 'Show details'}
      </button>
      <p>Signals loaded: {workspace.metrics.total}</p>
      <p>Health score: {workspace.healthScore}</p>
      {expanded ? (
        <pre>
          {bars.join('\n')}
        </pre>
      ) : null}
      <CognitiveWorkflowTimeline tenantId={tenantId} workspaceId={workspaceId} />
      <p>Latest: {workspace.metrics.latest}</p>
      <p>Top layers: {workspace.topLayers.join(', ') || 'none'}</p>
    </section>
  );
};
