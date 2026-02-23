import { useMemo } from 'react';
import type { CommandLabState } from '../../hooks/useCommandLab';

interface CommandLabTimelineProps {
  readonly state: Pick<CommandLabState, 'runLog'>;
}

export const CommandLabTimeline = ({ state }: CommandLabTimelineProps) => {
  const grouped = useMemo(
    () => state.runLog.map((line, index) => ({
      id: `${line}-${index}`,
      line,
      bucket: index % 3,
    })),
    [state.runLog],
  );

  return (
    <section className="command-lab-timeline">
      <h3>Execution timeline</h3>
      <ul>
        {grouped.length === 0 ? (
          <li>No timeline entries yet</li>
        ) : (
          grouped.map((entry) => (
            <li key={entry.id} className={`timeline-item bucket-${entry.bucket}`}>
              <strong>[{entry.bucket}]</strong>
              <span>{entry.line}</span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
};
