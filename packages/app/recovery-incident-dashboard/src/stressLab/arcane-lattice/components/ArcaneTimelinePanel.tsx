import { useMemo } from 'react';
import type { ArcaneWorkspaceState } from '../types';

interface ArcaneTimelinePanelProps {
  readonly workspace: ArcaneWorkspaceState;
  readonly timeline: readonly string[];
  readonly loading: boolean;
  readonly onRefresh: () => void;
}

interface TimelineEntry {
  readonly key: string;
  readonly label: string;
  readonly phase: string;
  readonly time: string;
}

const parseRow = (row: string): TimelineEntry => {
  const [time, label = 'workspace', phase = ''] = row.split(':');
  return {
    key: `${time}-${label}-${phase}`,
    label,
    phase,
    time,
  };
};

const badge = (phase: string): string => {
  if (phase.includes('start')) {
    return '▶';
  }
  if (phase.includes('stop')) {
    return '■';
  }
  if (phase.includes('refresh')) {
    return '⟳';
  }
  return '•';
};

export const ArcaneTimelinePanel = ({ workspace, timeline, loading, onRefresh }: ArcaneTimelinePanelProps) => {
  const rows = useMemo(() => timeline.map(parseRow).slice(0, 12), [timeline]);

  return (
    <section className="arcane-timeline-panel">
      <header>
        <h3>Timeline</h3>
        <p>
          Workspace <strong>{workspace.workspaceId}</strong>
        </p>
        <button onClick={onRefresh} type="button" disabled={loading}>
          {loading ? 'Loading…' : 'Refresh Timeline'}
        </button>
      </header>
      <ul>
        {rows.length === 0 ? (
          <li>No events yet.</li>
        ) : (
          rows.map((entry) => (
            <li key={entry.key}>
              <span>{badge(entry.phase)}</span>
              <span>{entry.time}</span>
              <span>{entry.label}</span>
              <span>{entry.phase}</span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
};
