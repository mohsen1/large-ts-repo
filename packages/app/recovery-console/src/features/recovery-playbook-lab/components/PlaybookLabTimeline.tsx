import { useMemo } from 'react';
import type { PlaybookTelemetryRow } from '../types';

export interface PlaybookLabTimelineProps {
  readonly rows: readonly PlaybookTelemetryRow[];
}

export const PlaybookLabTimeline = ({ rows }: PlaybookLabTimelineProps) => {
  const points = useMemo(
    () =>
      [...rows]
        .map((row) => ({
          ...row,
          startedAtMs: Date.parse(row.startedAt),
          completedAtMs: Date.parse(row.completedAt ?? row.startedAt),
        }))
        .sort((a, b) => a.startedAtMs - b.startedAtMs),
    [rows],
  );
  return (
    <section>
      <h3>Timeline</h3>
      <ol>
        {points.map((point) => (
          <li key={`${point.runId}-${point.playbookId}`}>
            <strong>{point.runId}</strong>
            <span> · {point.status}</span>
            <span> · selected {point.selected}</span>
            <span> · failures {point.failures}</span>
            <span> · duration {Math.max(0, point.completedAtMs - point.startedAtMs).toFixed(0)}ms</span>
          </li>
        ))}
      </ol>
    </section>
  );
};
