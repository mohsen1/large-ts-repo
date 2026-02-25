import { memo, type ReactElement } from 'react';
import type { WorkbenchSnapshot } from '../types';

interface WorkbenchTraceTimelineProps {
  readonly snapshots: readonly WorkbenchSnapshot[];
}

export const WorkbenchTraceTimeline = memo(function WorkbenchTraceTimeline({
  snapshots,
}: WorkbenchTraceTimelineProps): ReactElement {
  const traces = snapshots.flatMap((snapshot) =>
    snapshot.timeline.map((entry) => ({
      runId: snapshot.runId,
      stage: snapshot.stage,
      status: snapshot.status,
      entry,
    })),
  );

  return (
    <section>
      <h3>Trace Timeline</h3>
      <ul>
        {traces.map((trace, index) => (
          <li key={`${trace.runId}-${index}`}>
            <strong>{trace.status}</strong>
            {' '}
            <span>{`[${trace.stage}]`}</span>
            {' '}
            <code>{trace.entry}</code>
          </li>
        ))}
      </ul>
    </section>
  );
});
