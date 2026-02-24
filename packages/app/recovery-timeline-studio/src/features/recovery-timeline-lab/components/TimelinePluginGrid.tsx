import { RecoveryTimeline } from '@domain/recovery-timeline';
import type { ReactElement } from 'react';

interface TimelinePluginGridProps {
  timelines: readonly RecoveryTimeline[];
  selectedId: string | null;
  onSelectTimeline: (id: string) => void;
  onPreview: (id: string) => Promise<string>;
}

export function TimelinePluginGrid({
  timelines,
  selectedId,
  onSelectTimeline,
  onPreview,
}: TimelinePluginGridProps): ReactElement {
  return (
    <section>
      <h3>Timelines</h3>
      <table>
        <thead>
          <tr>
            <th>Timeline</th>
            <th>Events</th>
            <th>Team</th>
            <th>Preview</th>
          </tr>
        </thead>
        <tbody>
          {timelines.map((timeline) => {
            const isSelected = timeline.id === selectedId;
            return (
              <tr key={timeline.id} className={isSelected ? 'selected' : ''}>
                <td>
                  <button type="button" onClick={() => onSelectTimeline(timeline.id)}>
                    {timeline.name}
                  </button>
                </td>
                <td>{timeline.events.length}</td>
                <td>{timeline.ownerTeam}</td>
                <td>
                  <button
                    type="button"
                    onClick={async () => {
                      await onPreview(timeline.id);
                    }}
                  >
                    Preview
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
