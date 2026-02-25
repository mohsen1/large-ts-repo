import { memo } from 'react';
import type { SurfaceWorkspaceState } from '../../types/recoveryOrchestrationSurface';

type SignalRow = {
  readonly signalId: string;
  readonly kind: string;
  readonly ttl: number;
};

const toSignalRows = (workspace: SurfaceWorkspaceState | undefined): readonly SignalRow[] => {
  if (!workspace) {
    return [];
  }

  return workspace.signals.map((signal) => ({
    signalId: signal.signalId,
    kind: signal.kind,
    ttl: signal.ttlSeconds,
  }));
};

const groupKinds = (rows: readonly SignalRow[]): Readonly<Record<string, number>> => {
  return rows.reduce((acc, row: SignalRow) => {
    const count = acc[row.kind] ?? 0;
    return {
      ...acc,
      [row.kind]: count + 1,
    };
  }, {} as Record<string, number>);
};

export const SurfaceSignalStreamPanel = memo(function SurfaceSignalStreamPanel({
  workspace,
}: {
  readonly workspace: SurfaceWorkspaceState | undefined;
}) {
  const rows = toSignalRows(workspace);
  const counts = groupKinds(rows);

  const [tick, state, health] = ['tick', 'state', 'health'].map((kind) => counts[kind] ?? 0);

  return (
    <section>
      <header>
        <h3>Signals</h3>
      </header>
      <p>{`tick=${tick} state=${state} health=${health}`}</p>
      <ul>
        {rows.map((row: SignalRow) => (
          <li key={row.signalId}>
            {row.signalId}
            {' '}({row.kind})
            {' TTL '}
            {row.ttl}
          </li>
        ))}
      </ul>
    </section>
  );
});

SurfaceSignalStreamPanel.displayName = 'SurfaceSignalStreamPanel';
