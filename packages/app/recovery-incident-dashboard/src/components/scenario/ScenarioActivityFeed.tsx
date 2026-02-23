import { useMemo } from 'react';
import type { ScenarioEvent } from '../../types/scenario-dashboard/incidentScenarioWorkspace';

export interface ScenarioActivityFeedProps {
  readonly events: readonly ScenarioEvent[];
  readonly onSelectEvent: (id: ScenarioEvent['id']) => void;
}

export const ScenarioActivityFeed = ({ events, onSelectEvent }: ScenarioActivityFeedProps) => {
  const grouped = useMemo(() => {
    const map = new Map<string, ScenarioEvent[]>();
    for (const event of events) {
      const day = event.at.slice(0, 10);
      const bucket = map.get(day) ?? [];
      bucket.push(event);
      map.set(day, bucket);
    }
    return [...map.entries()];
  }, [events]);

  return (
    <section className="scenario-feed">
      <h3>Scenario Events</h3>
      {grouped.length === 0 ? (
        <p>No events yet.</p>
      ) : (
        grouped.map(([day, dayEvents]) => (
          <article key={day}>
            <h4>{day}</h4>
            <ul>
              {dayEvents.map((event) => (
                <li key={event.id}>
                  <button onClick={() => onSelectEvent(event.id)}>
                    <strong>{event.type.toUpperCase()}</strong> {event.title}
                  </button>
                  <p>{event.detail}</p>
                  <small>{new Date(event.at).toLocaleTimeString()}</small>
                </li>
              ))}
            </ul>
          </article>
        ))
      )}
    </section>
  );
};
