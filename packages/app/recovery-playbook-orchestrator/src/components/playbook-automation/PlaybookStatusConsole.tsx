import { useMemo } from 'react';

export interface PlaybookStatusConsoleProps {
  statuses: readonly string[];
}

export const PlaybookStatusConsole = ({ statuses }: PlaybookStatusConsoleProps) => {
  const ordered = useMemo(() => [...statuses].reverse(), [statuses]);
  const latest = ordered[0] ?? 'No statuses yet';

  return (
    <aside className="playbook-status-console">
      <h3>Status Console</h3>
      <p>Latest: {latest}</p>
      <ol>
        {ordered.map((status, index) => (
          <li key={`${status}-${index}`}>{status}</li>
        ))}
      </ol>
    </aside>
  );
};
