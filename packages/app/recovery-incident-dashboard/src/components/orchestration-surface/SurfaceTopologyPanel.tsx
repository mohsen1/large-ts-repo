import { memo, useMemo } from 'react';
import type { SurfaceWorkspaceState } from '../../types/recoveryOrchestrationSurface';

type TopologyRow = {
  readonly node: string;
  readonly out: number;
  readonly in_: number;
};

const buildTopologyRows = (workspace: SurfaceWorkspaceState | undefined): readonly TopologyRow[] => {
  if (!workspace) {
    return [];
  }

  return workspace.records.map((record, index: number): TopologyRow => ({
    node: `${workspace.workspace.workspaceId}:node:${index}`,
    out: index + 1,
    in_: Math.max(0, workspace.records.length - index),
  }));
};

export const SurfaceTopologyPanel = memo(function SurfaceTopologyPanel({
  workspace,
}: {
  readonly workspace: SurfaceWorkspaceState | undefined;
}) {
  const rows = useMemo(() => buildTopologyRows(workspace), [workspace]);

  if (rows.length === 0) {
    return <section>Topology not initialized yet.</section>;
  }

  return (
    <section>
      <header>
        <h3>Topology snapshot</h3>
      </header>
      <ul>
        {rows.map((row) => (
          <li key={row.node}>
            {row.node}
            {' => '}
            {row.out}
            {' / '}
            {row.in_}
          </li>
        ))}
      </ul>
    </section>
  );
});

SurfaceTopologyPanel.displayName = 'SurfaceTopologyPanel';

export const summarizeTopology = (rows: readonly TopologyRow[]): string => {
  const totalIn = rows.reduce((acc, row) => acc + row.in_, 0);
  const totalOut = rows.reduce((acc, row) => acc + row.out, 0);
  return `nodes:${rows.length} in=${totalIn} out=${totalOut}`;
};

export const renderTopologyTitle = (workspaceId: string | undefined): string =>
  workspaceId ? `${workspaceId} topology` : 'Orchestration topology';
