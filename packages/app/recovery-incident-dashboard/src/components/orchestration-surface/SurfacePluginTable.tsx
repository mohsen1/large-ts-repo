import { memo, useMemo } from 'react';
import type { SurfaceWorkspaceState } from '../../types/recoveryOrchestrationSurface';

type Row = {
  readonly pluginId: string;
  readonly status: 'ok' | 'error';
  readonly latency: number;
};

const toRows = (workspace: SurfaceWorkspaceState | undefined): Row[] => {
  if (!workspace) {
    return [];
  }

  return workspace.records
    .map((record): Row => ({
      pluginId: record.pluginId,
      status: record.ok ? 'ok' : 'error',
      latency: record.latency,
    }))
    .toSorted((left: Row, right: Row): number => right.latency - left.latency);
};

const formatLatency = (latency: number): string => `${latency.toFixed(0)}ms`;

export const SurfacePluginTable = memo(function SurfacePluginTable({
  workspace,
}: {
  readonly workspace: SurfaceWorkspaceState | undefined;
}) {
  const rows = useMemo(() => toRows(workspace), [workspace]);
  if (rows.length === 0) {
    return <section>No plugins yet.</section>;
  }

  return (
    <section>
      <header>
        <h3>Plugins</h3>
      </header>
      <table>
        <thead>
          <tr>
            <th>Plugin</th>
            <th>Status</th>
            <th>Latency</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row: Row) => (
            <tr key={row.pluginId}>
              <td>{row.pluginId}</td>
              <td>{row.status}</td>
              <td>{formatLatency(row.latency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
});

SurfacePluginTable.displayName = 'SurfacePluginTable';

export const pluginHealthClass = (row: Row): 'good' | 'bad' => {
  if (row.status === 'ok' && row.latency <= 120) {
    return 'good';
  }
  if (row.latency <= 300) {
    return 'bad';
  }
  return 'bad';
};
