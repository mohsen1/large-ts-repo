import { Fragment } from 'react';

interface TimelineSignalListProps {
  readonly events: readonly {
    readonly timelineId: string;
    readonly timelineName: string;
    readonly phase: string;
    readonly state: string;
    readonly riskBand: string;
    readonly score: number;
  }[];
  readonly activeTimelineId: string | null;
  readonly onSelect: (timelineId: string) => void;
}

const riskTone = (riskBand: string): string => {
  if (riskBand === 'critical') {
    return 'tone-critical';
  }
  if (riskBand === 'high') {
    return 'tone-high';
  }
  if (riskBand === 'medium') {
    return 'tone-medium';
  }
  return 'tone-low';
};

const timelineToRows = (events: TimelineSignalListProps['events']) => {
  const byTimeline = events.reduce<Map<string, TimelineSignalListProps['events']>>((acc, event) => {
    const existing = acc.get(event.timelineId) ?? [];
    return new Map(acc).set(event.timelineId, [...existing, event]);
  }, new Map<string, TimelineSignalListProps['events']>());

  return [...byTimeline.entries()].map(([timelineId, grouped]) => ({
    timelineId,
    timelineName: grouped[0]?.timelineName ?? timelineId,
    events: grouped,
  }));
};

export function TimelineSignalList({ events, activeTimelineId, onSelect }: TimelineSignalListProps) {
  const timelineGroups = timelineToRows(events);
  const selectedSet = new Set([activeTimelineId]);

  return (
    <section>
      <h3>Signal Event List</h3>
      <ul>
        {timelineGroups.map((group) => (
          <li key={group.timelineId}>
            <button type="button" onClick={() => onSelect(group.timelineId)}>
              <span>
                {group.timelineName}
                <small>{group.events.length} events</small>
              </span>
            </button>
            <ol>
              {group.events.map((event) => (
                <Fragment key={`${event.timelineId}:${event.phase}:${event.state}:${event.score}`}>
                  <li className={selectedSet.has(event.timelineId) ? 'selected' : riskTone(event.riskBand)}>
                    <strong>{event.phase}</strong>
                    <span>{event.state}</span>
                    <em>{event.riskBand}</em>
                    <code>{event.score}</code>
                  </li>
                </Fragment>
              ))}
            </ol>
          </li>
        ))}
      </ul>
    </section>
  );
}
