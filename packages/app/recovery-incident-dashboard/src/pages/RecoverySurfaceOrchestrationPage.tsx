import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  SurfacePluginTable,
  pluginHealthClass,
} from '../components/orchestration-surface/SurfacePluginTable';
import { SurfaceSignalStreamPanel } from '../components/orchestration-surface/SurfaceSignalStreamPanel';
import {
  SurfaceTopologyPanel,
  renderTopologyTitle,
  summarizeTopology,
} from '../components/orchestration-surface/SurfaceTopologyPanel';
import type { SurfaceLaneKind } from '@shared/recovery-orchestration-surface';
import { useSurfaceOrchestrationWorkspace } from '../hooks/useSurfaceOrchestrationWorkspace';

type TopologyRecord = {
  readonly node: string;
  readonly out: number;
  readonly in_: number;
};

type StatusRow = {
  readonly key: string;
  readonly ok: boolean;
  readonly latency: number;
};

const laneOptions: readonly SurfaceLaneKind[] = ['ingest', 'synthesize', 'simulate', 'score', 'actuate'];

export const RecoverySurfaceOrchestrationPage = () => {
  const workspaceSeed = 'acme-surface';
  const { workspace, loading, boot, run, statuses, summary, error } = useSurfaceOrchestrationWorkspace(workspaceSeed);
  const [selectedKind, setSelectedKind] = useState<SurfaceLaneKind>('ingest');

  useEffect(() => {
    if (!workspace && !loading) {
      void boot();
    }
  }, [boot, workspace, loading]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await run(selectedKind);
  };

  const sortedStatuses = useMemo(
    () => (statuses as readonly StatusRow[]).toSorted((left: StatusRow, right: StatusRow) => left.latency - right.latency),
    [statuses],
  );

  const topologySummary = workspace
    ? summarizeTopology(
        workspace.records.map((record, index: number): TopologyRecord => ({
          node: `${workspace.workspace.workspaceId}:${index}`,
          out: record.latency,
          in_: record.latency > 120 ? 2 : 1,
        })),
      )
    : '';

  return (
    <main>
      <h2>Recovery Surface Orchestration</h2>
      <p>{renderTopologyTitle(workspace?.workspace.workspaceId)}</p>
      <p>{topologySummary}</p>
      {summary ? (
        <section>
          <h3>Summary</h3>
          <pre>{JSON.stringify(summary.tags ?? [], null, 2)}</pre>
        </section>
      ) : null}
      <form onSubmit={submit}>
        <label>
          Stage
          <select value={selectedKind} onChange={(event) => setSelectedKind(event.target.value as SurfaceLaneKind)}>
            {laneOptions.map((lane) => (
              <option key={lane} value={lane}>
                {lane}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={loading}>
          {loading ? 'Running...' : 'Run'}
        </button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      <SurfaceTopologyPanel workspace={workspace} />
      <SurfacePluginTable workspace={workspace} />
      <SurfaceSignalStreamPanel workspace={workspace} />
      <section>
        <h3>Status rows ({sortedStatuses.length})</h3>
        <ul>
          {sortedStatuses.map((row: StatusRow) => (
            <li
              key={row.key}
              className={pluginHealthClass({
                pluginId: row.key,
                status: row.ok ? 'ok' : 'error',
                latency: row.latency,
              })}
            >
              {row.key}
              {' · '}
              {row.ok ? 'ok' : 'error'}
              {' · '}
              {row.latency}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
};
