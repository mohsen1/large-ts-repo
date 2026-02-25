import { useMemo, type ReactElement } from 'react';
import { RunTimelineInspector, TimelineSummary } from '../components/RunTimelineInspector';
import { WorkspaceRunCard } from '../components/WorkspaceRunCard';
import { PolicyPanel, PolicyDigest } from '../components/PolicyPanel';
import { useEcosystemObservability } from '../hooks/useEcosystemObservability';
import { useRecoveryEcosystemWorkspace } from '../hooks/useRecoveryEcosystemWorkspace';
import { useEcosystemPlugins } from '../hooks/useEcosystemPlugins';

export interface RecoveryEcosystemOperationsPageProps {
  readonly tenantId: string;
  readonly namespace: string;
}

export const RecoveryEcosystemOperationsPage = ({
  tenantId = 'tenant:default',
  namespace = 'recovery-ecosystem',
}: RecoveryEcosystemOperationsPageProps): ReactElement => {
  const workspace = useRecoveryEcosystemWorkspace({ tenantId, namespace });
  const observability = useEcosystemObservability(namespace as never);
  const plugins = useEcosystemPlugins(tenantId);

  const selectedPolicies = useMemo(
    () =>
      plugins.selected
        .map((policy) => `${policy}:enabled`)
        .toSorted()
        .join(', '),
    [plugins.selected],
  );

  const timelineEvents = useMemo(
    () =>
      observability.snapshots
        .flatMap((snapshot) =>
          snapshot.timeline.map((entry) => ({
            ...entry,
            runId: snapshot.runId,
          })),
        )
        .toSorted((left, right) => left.at.localeCompare(right.at)),
    [observability.snapshots],
  );

  return (
    <main>
      <h1>Recovery Ecosystem Operations</h1>
      <section className="operations-grid">
        <WorkspaceRunCard tenantId={tenantId} namespace={namespace} />
        <PolicyPanel
          tenantId={tenantId}
          onSelect={(name, enabled) => {
            plugins.select(name, enabled);
          }}
        />
      </section>

      <section>
        <h2>Workspace metrics</h2>
        <p>Snapshots: {workspace.workspace?.snapshotCount ?? 0}</p>
        <p>Active: {workspace.workspace?.active ?? 0}</p>
        <p>Run history: {workspace.history.length}</p>
        <p>Last error: {workspace.error ?? 'none'}</p>
      </section>

      <section>
        <h2>Policy digest</h2>
        <PolicyDigest value={selectedPolicies} />
      </section>

      <section>
        <h2>Observability feed</h2>
        {observability.loading ? <p>Loading...</p> : null}
        <button type="button" onClick={() => void observability.refresh()}>
          Refresh feed
        </button>
        <button type="button" onClick={() => {
          void observability.clearErrors();
        }}>
          Clear observability errors
        </button>
        <TimelineSummary events={timelineEvents} />
        <RunTimelineInspector namespace={namespace} snapshots={observability.snapshots} />
        {observability.errors.length ? (
          <ul>
            {observability.errors.toSorted().map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section>
        <h2>Actions</h2>
        <button type="button" onClick={() => void workspace.refresh()}>
          Refresh workspace
        </button>
        <button type="button" onClick={() => plugins.select('telemetry-export', true)}>
          Enable telemetry
        </button>
        <button type="button" onClick={() => plugins.select('artifact-commit', false)}>
          Disable artifact
        </button>
      </section>
    </main>
  );
};

export const RecoveryEcosystemStudioPage = (): ReactElement => (
  <main>
    <h1>Recovery Ecosystem Studio</h1>
    <RecoveryEcosystemOperationsPage tenantId="tenant:default" namespace="recovery-ecosystem" />
  </main>
);

export default RecoveryEcosystemOperationsPage;

