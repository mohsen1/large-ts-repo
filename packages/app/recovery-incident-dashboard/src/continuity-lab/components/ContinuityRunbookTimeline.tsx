import { useMemo } from 'react';
import type { ContinuityExecutionOutput } from '@service/recovery-runner';

export interface ContinuityRunbookTimelineProps {
  readonly queue: readonly ContinuityExecutionOutput[];
}

interface TimelinePoint {
  readonly sessionId: string;
  readonly planCount: number;
  readonly status: string;
}

const buildTimeline = (queue: readonly ContinuityExecutionOutput[]): readonly TimelinePoint[] =>
  queue.map((entry) => ({
    sessionId: String(entry.workspaceId),
    planCount: entry.manifests.length,
    status: entry.manifests.at(-1)?.status ?? 'queued',
  }));

export const ContinuityRunbookTimeline = ({ queue }: ContinuityRunbookTimelineProps) => {
  const timeline = useMemo(() => buildTimeline(queue), [queue]);

  return (
    <section>
      <h3>Continuity timeline</h3>
      <ol>
        {timeline.map((entry) => (
          <li key={entry.sessionId}>
            <strong>{entry.sessionId}</strong>
            <span>{` plans: ${entry.planCount}`}</span>
            <em>{` status=${entry.status}`}</em>
          </li>
        ))}
      </ol>
    </section>
  );
};
