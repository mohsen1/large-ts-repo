import { useMemo } from 'react';
import { type StreamLabExecutionTrace } from '../../stress-lab/types';
import { type TimelinePoint } from '../../hooks/useStreamLabTimeline';

type StageBadge = {
  readonly stage: StreamLabExecutionTrace['pluginKind'];
  readonly count: number;
};

export interface SessionTimelinePanelProps {
  readonly traces: readonly StreamLabExecutionTrace[];
  readonly timeline: readonly TimelinePoint[];
}

const groupByStage = (traces: readonly StreamLabExecutionTrace[]): readonly StageBadge[] => {
  const accumulator: Record<string, number> = {};
  for (const trace of traces) {
    accumulator[trace.pluginKind] = (accumulator[trace.pluginKind] ?? 0) + 1;
  }
  return Object.entries(accumulator)
    .map(([stage, count]) => ({ stage: stage as StreamLabExecutionTrace['pluginKind'], count }))
    .toSorted((left, right) => right.count - left.count);
};

export const SessionTimelinePanel = ({ traces, timeline }: SessionTimelinePanelProps) => {
  const stageCount = useMemo(() => groupByStage(traces), [traces]);
  const ordered = useMemo(() => timeline.toSorted((left, right) => left.order - right.order), [timeline]);

  return (
    <section>
      <h3>Session Timeline</h3>
      <div style={{ display: 'flex', gap: 12 }}>
        {stageCount.map((item) => (
          <span key={item.stage} style={{ padding: 8, borderRadius: 4, border: '1px solid #304155' }}>
            {item.stage}: {item.count}
          </span>
        ))}
      </div>
      <ol>
        {ordered.map((point) => (
          <li key={`${point.label}-${point.order}`}>
            <strong>{point.label}</strong>
            <span> · </span>
            <span>{point.status}</span>
            <span> · </span>
            <span>{point.elapsedMs}ms</span>
          </li>
        ))}
      </ol>
    </section>
  );
};
