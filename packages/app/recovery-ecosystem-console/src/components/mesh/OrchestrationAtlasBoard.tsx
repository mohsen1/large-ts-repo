import { useMemo } from 'react';
import { useEcosystemMeshOrchestrator } from '../../hooks/useEcosystemMeshOrchestrator';
import type { TenantId, WorkspaceId } from '@domain/recovery-ecosystem-orchestrator-core';
import type { MeshPluginDefinition } from '@domain/recovery-ecosystem-orchestrator-core';

interface BoardProps {
  readonly plugins: readonly MeshPluginDefinition[];
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
}

export const OrchestrationAtlasBoard = (props: BoardProps) => {
  const { plugins, tenantId, workspaceId } = props;
  const { snapshot, plugins: pluginRows, stageOrder } = useEcosystemMeshOrchestrator<Record<string, unknown>>(plugins, tenantId, workspaceId);

  const totalByStage = useMemo(
    () =>
      pluginRows.reduce(
        (acc, plugin) => {
          acc[plugin.stage] = (acc[plugin.stage] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    [pluginRows],
  );

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <header>
        <h2>Mesh Atlas Board</h2>
        <p>{snapshot.pluginNames.length} plugins · {stageOrder.length} stage transitions</p>
      </header>
      <ul>
        {Object.entries(totalByStage).map(([stage, count]) => (
          <li key={stage}>
            {stage}: {count}
          </li>
        ))}
      </ul>
      <div style={{ display: 'grid', gap: 8 }}>
        {pluginRows.map((plugin) => (
          <article
            key={plugin.name}
            style={{ border: '1px solid #3b3f52', borderRadius: 8, padding: 8 }}
          >
            <h3>{plugin.name}</h3>
            <p>stage: {plugin.stage}</p>
          </article>
        ))}
      </div>
    </section>
  );
};
