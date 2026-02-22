import { useMemo } from 'react';
import type { DashboardRunState } from '../types';

export interface RecoveryTimelineProps {
  runs: readonly DashboardRunState[];
  onSelect: (runId: DashboardRunState['runId']) => void;
}

export const RecoveryTimeline = ({ runs, onSelect }: RecoveryTimelineProps) => {
  const grouped = useMemo(() => {
    const buckets = new Map<string, DashboardRunState[]>();
    for (const run of runs) {
      const bucket = run.state;
      const next = buckets.get(bucket) ?? [];
      next.push(run);
      buckets.set(bucket, next);
    }
    return [...buckets.entries()];
  }, [runs]);

  if (runs.length === 0) {
    return <p>No runs yet.</p>;
  }

  return (
    <div className="recovery-timeline">
      {grouped.map(([state, entries]) => (
        <section key={state}>
          <h4>{state}</h4>
          <ul>
            {entries.map((entry) => (
              <li key={entry.runId}>
                <button onClick={() => onSelect(entry.runId)}>{entry.runId}</button>
                <span>node: {entry.nodeId}</span>
                <span>at: {entry.startedAt}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
};

export const timelineClass = 'recovery-timeline';
