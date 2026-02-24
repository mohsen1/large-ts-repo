import { useState } from 'react';
import { RecoveryConvergenceStudioDashboard } from '../components/RecoveryConvergenceStudioDashboard';
import { RecoveryConvergenceStudioTimelinePanel } from '../components/RecoveryConvergenceStudioTimelinePanel';
import { RecoveryConvergenceStudioRunbookPanel } from '../components/RecoveryConvergenceStudioRunbookPanel';
import { runStudioWorkspace, type StudioWorkspace } from '../services/convergenceStudioService';

const tenants = ['tenant:recovery:lab', 'tenant:recovery:ops', 'tenant:recovery:edge'];

const toWorkspaceLabel = (workspace: StudioWorkspace | null): string => {
  if (!workspace) return 'No workspace loaded';
  const runbookCount = workspace.runs.reduce((acc, entry) => acc + entry.selectedRunbookCount, 0);
  return `${workspace.tenantId} / runs ${workspace.runs.length} / runbooks ${runbookCount}`;
};

export const RecoveryStressStudioPage = () => {
  const [tenantId, setTenantId] = useState(tenants[0] as string);
  const [workspace, setWorkspace] = useState<StudioWorkspace | null>(null);
  const [selected, setSelected] = useState('tenant');

  const refresh = async () => {
    const next = await runStudioWorkspace({ tenantId, scopes: ['tenant', 'topology', 'signal', 'policy', 'fleet'] });
    setWorkspace(next);
  };

  const scopeFilter = selected === 'all'
    ? ['tenant', 'topology', 'signal', 'policy', 'fleet']
    : [selected as 'tenant'];

  return (
    <main className="recovery-studio-page">
      <header className="recovery-studio-page__header">
        <h1>Recovery Stress Lab Studio</h1>
        <p>Synthetic convergence orchestration control room</p>
      </header>
      <section className="recovery-studio-page__controls">
        <label>
          Tenant
          <select value={tenantId} onChange={(event) => setTenantId(event.target.value)}>
            {tenants.map((tenant) => (
              <option key={tenant} value={tenant}>
                {tenant}
              </option>
            ))}
          </select>
        </label>
        <label>
          Scope
          <select value={selected} onChange={(event) => setSelected(event.target.value)}>
            <option value="all">all</option>
            <option value="tenant">tenant</option>
            <option value="topology">topology</option>
            <option value="signal">signal</option>
            <option value="policy">policy</option>
            <option value="fleet">fleet</option>
          </select>
        </label>
        <button type="button" onClick={refresh}>
          Load Workspace
        </button>
      </section>
      <section className="recovery-studio-page__summary">
        <h2>{toWorkspaceLabel(workspace)}</h2>
      </section>
      <section className="recovery-studio-page__body">
        <RecoveryConvergenceStudioDashboard tenantId={tenantId} />
        {workspace ? (
          <RecoveryConvergenceStudioRunbookPanel runs={workspace.runs.filter((run) => scopeFilter.includes(run.scope))} />
        ) : (
          <p>Runbook panel is waiting for workspace</p>
        )}
        <RecoveryConvergenceStudioTimelinePanel
          timeline={workspace ? { runIds: workspace.runs.map((entry) => entry.runId), eventCount: workspace.runs.length, latestRunAt: new Date().toISOString() } : null}
          runIds={workspace?.runs.map((entry) => entry.runId) ?? []}
        />
      </section>
    </main>
  );
};
