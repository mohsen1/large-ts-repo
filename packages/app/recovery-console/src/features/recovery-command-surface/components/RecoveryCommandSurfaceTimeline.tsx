import { useMemo } from 'react';

import type { SurfaceRun } from '@domain/recovery-command-surface-models';

interface RecoveryCommandSurfaceTimelineProps {
  readonly runs: readonly SurfaceRun[];
}

interface TimelinePoint {
  readonly runId: string;
  readonly state: SurfaceRun['state'];
  readonly order: number;
  readonly label: string;
}

const toLabel = (point: TimelinePoint): string =>
  `${point.label} • ${point.state} (${point.runId.slice(0, 14)})`;

export const RecoveryCommandSurfaceTimeline = ({ runs }: RecoveryCommandSurfaceTimelineProps) => {
  const points = useMemo<TimelinePoint[]>(() => {
    const sorted = [...runs].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    return sorted.map((run, index) => ({
      runId: run.id,
      state: run.state,
      order: index,
      label: run.scenario,
    }));
  }, [runs]);

  if (points.length === 0) {
    return <p>No runs to display.</p>;
  }

  return (
    <section>
      <h3>Run Timeline</h3>
      <ul>
        {points.map((point) => (
          <li key={`${point.runId}-${point.order}`}>
            <strong>{point.order + 1}.</strong> {toLabel(point)}
          </li>
        ))}
      </ul>
    </section>
  );
};
