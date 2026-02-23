import { Fragment, useMemo } from 'react';
import { RecoveryTimelineEvent } from '@domain/recovery-timeline';

interface TimelineBoardProps {
  events: RecoveryTimelineEvent[];
  selectedId: string | null;
  onSelect: (eventId: string) => void;
}

export function TimelineBoard({ events, selectedId, onSelect }: TimelineBoardProps) {
  const ordered = useMemo(() => [...events].sort((a, b) => a.start.getTime() - b.start.getTime()), [events]);

  return (
    <section>
      <h2>Timeline Board</h2>
      <ol>
        {ordered.map((event) => {
          const isSelected = event.id === selectedId;
          const cls = isSelected ? 'timeline-row selected' : 'timeline-row';
          return (
            <li key={event.id} className={cls}>
              <button type="button" onClick={() => onSelect(event.id)}>
                <div>
                  <strong>{event.title}</strong>
                  <span>{event.owner}</span>
                </div>
                <div>
                  <small>{event.phase}</small>
                  <span>{event.state}</span>
                  <strong>{event.riskScore}</strong>
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
