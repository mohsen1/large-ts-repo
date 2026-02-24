import { useMemo } from 'react';
import { withBrand } from '@shared/core';
import { useRecoveryOpsGraphWorkspace } from '../hooks/useRecoveryOpsGraphWorkspace';
import { GraphOpsExecutionConsole } from '../components/GraphOpsExecutionConsole';
import { GraphOpsPlanCatalog } from '../components/GraphOpsPlanCatalog';
import { GraphOpsSignalTimeline } from '../components/GraphOpsSignalTimeline';

interface RecoveryOpsGraphLabPageProps {
  readonly tenantId: string;
  readonly incidentId: string;
}

export const RecoveryOpsGraphLabPage = ({ tenantId, incidentId }: RecoveryOpsGraphLabPageProps) => {
  const {
    workspace,
    pluginCatalog,
    runWorkspace,
    togglePlugin,
    setProfile,
  } = useRecoveryOpsGraphWorkspace(tenantId, incidentId);

  const title = useMemo(() => `Graph lab workspace · ${tenantId}`, [tenantId]);
  const stats = useMemo(
    () => `Run #${workspace.runCount} · ${workspace.selectedPluginIds.length} plugin(s) active`,
    [workspace.runCount, workspace.selectedPluginIds.length],
  );

  return (
    <main style={{ display: 'grid', gap: '1rem', padding: '1rem', color: '#e2e8f0' }}>
      <header>
        <h1>{title}</h1>
        <p>{stats}</p>
      </header>
      <section style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
        <aside style={{ display: 'grid', gap: '0.75rem' }}>
          <GraphOpsPlanCatalog
            workspace={workspace}
            onTogglePlugin={togglePlugin}
            onProfileChange={(event) => setProfile(withBrand(event.target.value, 'ProfileId'))}
          />
          <GraphOpsSignalTimeline signals={workspace.signals} />
          <pre
            style={{
              border: '1px solid #2a2e3f',
              borderRadius: 8,
              padding: '0.65rem',
              background: '#0b1320',
              minHeight: 240,
              overflow: 'auto',
            }}
          >
            plugins {pluginCatalog.map((plugin) => plugin.name).join(', ')}
          </pre>
        </aside>
        <div>
          <GraphOpsExecutionConsole workspace={workspace} onRun={runWorkspace} />
          <section style={{ marginTop: '1rem' }}>
            <h2>Diagnostics</h2>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {workspace.diagnostics.map((diagnostic, index) => (
                <li key={`${diagnostic.pluginId}:${index}`}>
                  {diagnostic.pluginId} · {diagnostic.status} · {diagnostic.metrics.length} metric(s)
                </li>
              ))}
            </ul>
          </section>
        </div>
      </section>
    </main>
  );
};
