import { useMemo } from 'react';
import type { CommandLabWorkspace } from '../../types/recoveryCommandLab';
import type { CommandLabCommandTile } from '../../types/recoveryCommandLab';
import { CommandLabRunline } from './CommandLabRunline';
import type { ReactElement } from 'react';

interface CommandLabPlanBoardProps {
  readonly workspace: CommandLabWorkspace | null;
  readonly commandTiles: readonly CommandLabCommandTile[];
  readonly loading: boolean;
}

export const CommandLabPlanBoard = ({
  workspace,
  commandTiles,
  loading,
}: CommandLabPlanBoardProps): ReactElement => {
  const sessionCount = workspace?.sessions.length ?? 0;
  const commandCount = commandTiles.length;
  const risk = useMemo(
    () => commandTiles.reduce((sum, tile) => sum + tile.riskScore, 0) / Math.max(1, commandCount),
    [commandTiles, commandCount],
  );

  if (!workspace) {
    return <section className="command-lab-board">loading workspace…</section>;
  }

  return (
    <section className="command-lab-board">
      <header>
        <h3>{workspace.label}</h3>
        <p>{`tenant=${workspace.tenantId} sessions=${sessionCount}`}</p>
      </header>
      <p>{`commands=${commandCount} avg-risk=${risk.toFixed(2)}`}</p>
      <p>{`status=${loading ? 'loading' : 'ready'}`}</p>
      <CommandLabRunline items={commandTiles} />
      <ul>
        {workspace.events.map((event) => (
          <li key={event}>{event}</li>
        ))}
      </ul>
    </section>
  );
};
