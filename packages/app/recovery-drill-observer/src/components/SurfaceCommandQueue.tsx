import type { SurfaceWindow, SurfaceCommand } from '@service/recovery-drill-surface-orchestrator';

interface Props {
  readonly windows: readonly SurfaceWindow[];
  readonly commands: readonly SurfaceCommand[];
}

const formatIso = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'invalid-time';
  }
  return parsed.toISOString();
};

const sortWindows = (left: SurfaceWindow, right: SurfaceWindow): number => {
  return new Date(left.from).getTime() - new Date(right.from).getTime();
};

export const SurfaceCommandQueue = ({ windows, commands }: Props) => {
  const ordered = [...windows].sort(sortWindows);

  return (
    <section>
      <h2>Window schedule</h2>
      <div style={{ marginBottom: 12 }}>
        {ordered.map((window) => (
          <article key={window.id} style={{ borderBottom: '1px solid #dfe5ee', marginBottom: 8 }}>
            <p>
              {window.id} · {window.profile.tenant}/{window.profile.zone}
            </p>
            <p>
              open {formatIso(window.from)} to {formatIso(window.to)}
            </p>
            <p>
              max concurrent {window.profile.maxConcurrentRuns}, preferred {window.profile.preferredPriority}
            </p>
          </article>
        ))}
      </div>
      <h3>Queued commands</h3>
      <ul>
        {commands.map((command) => (
          <li key={command.commandId}>
            {command.commandId} {command.type} {command.workspaceId}::{command.scenarioId} goal={command.goal.label}
          </li>
        ))}
      </ul>
    </section>
  );
};
