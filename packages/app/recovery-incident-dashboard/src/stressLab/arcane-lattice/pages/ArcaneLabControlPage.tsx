import { useCallback } from 'react';
import { ArcaneWorkspaceDashboard } from '../components/ArcaneWorkspaceDashboard';
import { createArcaneRegistry } from '../registry';
import { useArcaneLabWorkspace } from '../hooks/useArcaneLabWorkspace';
import { buildArcaneSampleCatalog } from '../services/arcaneSampleService';
import { type ArcanePlugin } from '../types';
import type { ArcaneRunFrame } from '../runtime';

interface ArcaneLabControlPageProps {
  readonly tenantId: string;
}

export const ArcaneLabControlPage = ({ tenantId }: ArcaneLabControlPageProps) => {
  const {
    workspace: snapshot,
    timeline,
    selectedKinds,
    isRunning,
    start,
    stop,
    toggleKind,
    emit,
  } = useArcaneLabWorkspace({
    tenantId,
    autoRefreshMs: 12000,
  });

  const workspace = snapshot.workspace;

  const catalog = buildArcaneSampleCatalog(tenantId);
  const registry = createArcaneRegistry(catalog as never);

  const frame: ArcaneRunFrame<readonly ArcanePlugin[]> = {
    workspace,
    registry,
    status: workspace.status,
    activeSession: workspace.sessionId,
    createdAt: new Date().toISOString(),
  };

  const catalogMap = registry.manifest();
  const catalogSummary = Object.entries(catalogMap).map(([kind, list]) => `${kind}:${list.length}`);

  const handleStart = useCallback(() => {
    emit('workspace/start');
    void start(catalog);
  }, [emit, start, catalog]);

  const handleStop = useCallback(() => {
    emit('workspace/stop');
    stop();
  }, [emit, stop]);

  const handleRefresh = useCallback(() => {
    emit('workspace/refresh');
  }, [emit]);

  return (
    <section className="arcane-control-page">
      <ArcaneWorkspaceDashboard
        frame={frame}
        catalog={catalogMap}
        catalogSummary={catalogSummary}
        selectedKinds={selectedKinds}
        timeline={timeline}
        loading={isRunning}
        onStart={handleStart}
        onStop={handleStop}
        onToggleKind={toggleKind}
        onRefresh={handleRefresh}
      />

      <aside>
        <h3>Quick Facts</h3>
        <ul>
          <li>
            Tenant: <strong>{snapshot.tenantId}</strong>
          </li>
          <li>
            Workspace: <strong>{workspace.workspaceId}</strong>
          </li>
          <li>
            Run: <strong>{workspace.runId}</strong>
          </li>
          <li>
            Session: <strong>{workspace.sessionId}</strong>
          </li>
          <li>Selected kinds: {selectedKinds.join(', ') || 'none'}</li>
        </ul>
      </aside>
    </section>
  );
};

export default ArcaneLabControlPage;
