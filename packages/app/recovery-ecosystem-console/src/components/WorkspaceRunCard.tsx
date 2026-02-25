import { useMemo, type ReactElement } from 'react';
import { useRecoveryEcosystemWorkspace } from '../hooks/useRecoveryEcosystemWorkspace';

interface WorkspaceMetric {
  readonly namespace: string;
  readonly snapshotCount: number;
  readonly active: number;
}

const metricStatus = (metric: WorkspaceMetric): 'idle' | 'busy' | 'critical' => {
  if (metric.snapshotCount === 0) {
    return 'idle';
  }
  if (metric.active > 4) {
    return 'critical';
  }
  return 'busy';
};

const statusClass = (state: ReturnType<typeof metricStatus>): string =>
  state === 'critical' ? 'metric-critical' : state === 'busy' ? 'metric-busy' : 'metric-idle';

export const WorkspaceRunCard = ({ tenantId, namespace }: { readonly tenantId: string; readonly namespace: string }): ReactElement => {
  const workspace = useRecoveryEcosystemWorkspace({ tenantId, namespace });
  const metrics = useMemo<WorkspaceMetric>(
    () => ({
      namespace,
      snapshotCount: workspace.workspace?.snapshotCount ?? 0,
      active: workspace.workspace?.active ?? 0,
    }),
    [namespace, workspace.workspace?.active, workspace.workspace?.snapshotCount],
  );

  const state = useMemo(() => metricStatus(metrics), [metrics]);

  return (
    <article className={`run-card ${statusClass(state)}`}>
      <h3>Workspace overview</h3>
      <dl>
        <dt>namespace</dt>
        <dd>{metrics.namespace}</dd>
        <dt>snapshot count</dt>
        <dd>{metrics.snapshotCount}</dd>
        <dt>active runs</dt>
        <dd>{metrics.active}</dd>
      </dl>
      <p>
        status: <strong>{state}</strong>
      </p>
      <p>
        runtime: {workspace.running ? 'processing' : 'ready'}
        {' '}
        {workspace.error ? ` / ${workspace.error}` : ''}
      </p>
      <button type="button" onClick={() => void workspace.refresh()} disabled={workspace.running}>
        Refresh workspace
      </button>
    </article>
  );
};

export const WorkspaceDigest = ({ namespace }: { readonly namespace: string }): ReactElement => {
  const chunks = namespace.split(':').filter(Boolean);
  const digest = useMemo(() => chunks.map((value, index) => `${index}-${value}`).join(' | '), [namespace]);
  return <p>{digest}</p>;
};

export const WorkspaceEvents = ({ history }: { readonly history: readonly string[] }): ReactElement => {
  const timeline = useMemo(
    () => history.map((entry, index) => ({ key: `history:${index}`, value: entry })).toSorted((left, right) =>
      right.key.localeCompare(left.key),
    ),
    [history],
  );

  return (
    <ul>
      {timeline.map((entry) => (
        <li key={entry.key}>{entry.value}</li>
      ))}
    </ul>
  );
};

