import type { ReactElement } from 'react';

export interface ChronicleLabTimelineProps {
  readonly title: string;
  readonly events: readonly string[];
  readonly onSelectEvent?: (index: number, event: string) => void;
}

export const ChronicleLabTimeline = ({ title, events, onSelectEvent }: ChronicleLabTimelineProps): ReactElement => {
  const max = 20;
  const visible = events.slice(0, max);
  const hidden = events.length - visible.length;

  return (
    <section>
      <h2>{title}</h2>
      <p>Showing {visible.length} of {events.length} events</p>
      <ul>
        {visible.map((event, index) => (
          <li key={`${index}-${event}`}>
            <button type="button" onClick={() => onSelectEvent?.(index, event)}>
              {event}
            </button>
          </li>
        ))}
      </ul>
      {hidden > 0 ? <p>{hidden} additional events</p> : null}
    </section>
  );
};

export const ChronicleLabTimelineStrip = ({ events, title = 'Timeline strip' }: { events: readonly string[]; title?: string }): ReactElement => {
  const buckets = events.reduce<Record<string, number>>((acc, item) => {
    const key = item.split(':')[0] ?? 'unknown';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section>
      <h3>{title}</h3>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {Object.entries(buckets).map(([bucket, count]) => (
          <span key={bucket} style={{ padding: 6, border: '1px solid #ccc' }}>
            {bucket}: {count}
          </span>
        ))}
      </div>
    </section>
  );
};
