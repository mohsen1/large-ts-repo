import { useMemo } from 'react';
import type { ScopedTimelineState } from '../services/convergenceStudioService';

interface Props {
  readonly timeline: ScopedTimelineState | null;
  readonly runIds: readonly string[];
}

const buildTimelineLines = (timeline: ScopedTimelineState | null, runIds: readonly string[]) => {
  if (!timeline) {
    return [] as const;
  }

  const entries = new Map<string, string[]>();
  for (const runId of runIds) {
    const bucket = entries.get('run') ?? [];
    entries.set('run', [...bucket, `${runId}::${new Date().toLocaleTimeString()}`]);
  }

  const diagnostics = Array.from(entries.entries()).flatMap((entry) => entry[1]);

  return [
    ...diagnostics,
    `events:${timeline.eventCount}`,
    `latest:${timeline.latestRunAt ?? 'pending'}`,
  ];
};

export const RecoveryConvergenceStudioTimelinePanel = ({ timeline, runIds }: Props) => {
  const lines = useMemo(
    () => buildTimelineLines(timeline, runIds),
    [timeline, runIds],
  );

  const label = timeline ? 'Active timeline' : 'Waiting for diagnostics';

  return (
    <section className="convergence-timeline">
      <h3>{label}</h3>
      <div className="timeline-grid">
        {lines.length === 0 ? (
          <p>No timeline events yet</p>
        ) : (
          <ul>
            {lines.toSorted().map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </div>
      <details>
        <summary>Raw timeline ids</summary>
        <pre>{JSON.stringify(runIds, null, 2)}</pre>
      </details>
    </section>
  );
};
