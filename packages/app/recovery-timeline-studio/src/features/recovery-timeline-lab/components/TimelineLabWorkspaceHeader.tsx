interface TimelineLabWorkspaceHeaderProps {
  timelineName: string;
  ownerTeam: string;
  activeEvents: number;
  completedEvents: number;
  onRefresh: () => void;
}

export function TimelineLabWorkspaceHeader({
  timelineName,
  ownerTeam,
  activeEvents,
  completedEvents,
  onRefresh,
}: TimelineLabWorkspaceHeaderProps): ReactElement {
  return (
    <header>
      <section>
        <h1>{timelineName}</h1>
        <h2>{ownerTeam}</h2>
      </section>
      <section>
        <p>Active events: {activeEvents}</p>
        <p>Completed events: {completedEvents}</p>
      </section>
      <button type="button" onClick={onRefresh}>
        Refresh
      </button>
    </header>
  );
}
import type { ReactElement } from 'react';
