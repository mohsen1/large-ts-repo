import { useMemo } from 'react';

interface RecoveryCommandTimelineProps {
  readonly events: readonly string[];
}

export const RecoveryCommandTimeline = ({ events }: RecoveryCommandTimelineProps) => {
  const timeline = useMemo(() => {
    let cursor = 0;
    return events.map((event) => {
      cursor += 1;
      return {
        id: `${cursor}`,
        event,
        step: cursor,
      };
    });
  }, [events]);

  return (
    <section className="recovery-command-timeline">
      <h3>Command timeline</h3>
      <div className="timeline">
        {timeline.map((item) => (
          <div className="timeline-entry" key={item.id}>
            <span className="timeline-step">{item.step}</span>
            <span className="timeline-event">{item.event}</span>
          </div>
        ))}
      </div>
      {timeline.length === 0 ? <p>No timeline events</p> : null}
    </section>
  );
};
