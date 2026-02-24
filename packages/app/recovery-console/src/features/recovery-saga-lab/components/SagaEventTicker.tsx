import type { SagaRuntimeSnapshot } from '@service/recovery-incident-saga-orchestrator';
import type { ReactElement } from 'react';

interface Props {
  readonly snapshot?: SagaRuntimeSnapshot;
}

export const SagaEventTicker = ({ snapshot }: Props): ReactElement => {
  const lines = (snapshot?.events ?? []).map((event, index) => {
    const tags = [event.namespace, event.kind, event.eventId, event.recordedAt].join(' ');
    return `${index + 1}. ${tags}`;
  });

  return (
    <section className="saga-event-ticker">
      <h3>Events</h3>
      <ul>
        {lines.length === 0 ? <li>no events</li> : lines.toReversed().map((line) => <li key={line}>{line}</li>)}
      </ul>
      <p>State: {snapshot?.state ?? 'idle'}</p>
    </section>
  );
};
