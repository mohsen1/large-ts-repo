import { Fragment } from 'react';
import { RecoveryTimelineEvent } from '@domain/recovery-timeline';

interface TimelineDetailProps {
  event: RecoveryTimelineEvent | undefined;
}

export function TimelineDetailDrawer({ event }: TimelineDetailProps) {
  if (!event) {
    return (
      <aside>
        <h3>No event selected</h3>
        <p>Choose an event from the timeline board to inspect details.</p>
      </aside>
    );
  }

  return (
    <aside>
      <h3>{event.title}</h3>
      <ul>
        <li><strong>Owner:</strong> {event.owner}</li>
        <li><strong>Phase:</strong> {event.phase}</li>
        <li><strong>State:</strong> {event.state}</li>
        <li><strong>Risk:</strong> {event.riskScore}</li>
        <li><strong>Window:</strong> {event.start.toISOString()} - {event.end.toISOString()}</li>
        <li><strong>Dependencies:</strong>
          <ul>
            {event.dependencies.map((dependency) => (
              <li key={dependency}>{dependency}</li>
            ))}
          </ul>
        </li>
      </ul>
      <Fragment>
        {event.metadata && Object.keys(event.metadata).length > 0 ? (
          <div>
            <h4>Metadata</h4>
            <pre>{JSON.stringify(event.metadata, null, 2)}</pre>
          </div>
        ) : null}
      </Fragment>
    </aside>
  );
}
