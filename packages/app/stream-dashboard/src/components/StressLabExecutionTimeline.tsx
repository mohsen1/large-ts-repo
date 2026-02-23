import { useMemo } from 'react';
import { StreamStressLabWorkspace } from '../types/stressLab';

export interface StressLabExecutionTimelineProps {
  workspace: StreamStressLabWorkspace;
}

interface TimelineItem {
  readonly key: string;
  readonly runbook: string;
  readonly start: number;
  readonly end: number;
  readonly phaseCount: number;
}

const parseMinute = (isoDate: string): number => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return 0;
  return date.getUTCHours() * 60 + date.getUTCMinutes();
};

const buildTimeline = (workspace: StreamStressLabWorkspace): TimelineItem[] => {
  if (!workspace.plan) return [];

  return workspace.plan.schedule.map((entry, index) => {
    const workloadId = workspace.runbooks[index]?.id ?? 'unknown';
    const start = parseMinute(entry.startAt);
    const end = parseMinute(entry.endAt);
    return {
      key: `${entry.runbookId}-${index}`,
      runbook: String(workloadId),
      start,
      end,
      phaseCount: entry.phaseOrder.length,
    };
  });
};

export function StressLabExecutionTimeline({ workspace }: StressLabExecutionTimelineProps) {
  const items = useMemo(() => buildTimeline(workspace), [workspace.plan]);
  const maxMinute = items.length > 0 ? Math.max(...items.map((entry) => entry.end)) : 1;
  const widthStyle = (start: number, end: number): { left: string; width: string } => {
    const left = `${Math.round((start / 1440) * 100)}%`;
    const width = `${Math.round(((end - start) / Math.max(1, maxMinute)) * 100)}%`;
    return { left, width };
  };

  return (
    <section>
      <h3>Execution Timeline</h3>
      <p>Entries: {items.length}</p>
      <div style={{ position: 'relative', height: 240, border: '1px dashed #ccc', marginTop: 8 }}>
        {items.map((item) => {
          const position = widthStyle(item.start, item.end);
          return (
            <div
              key={item.key}
              style={{
                position: 'absolute',
                left: position.left,
                width: position.width,
                top: 8,
                height: 24,
                background: '#7c4dff',
                color: '#fff',
                borderRadius: 4,
                padding: '2px 4px',
                fontSize: 12,
              }}
            >
              {item.runbook} ({item.phaseCount})
            </div>
          );
        })}
      </div>
      <ul>
        {items.slice(0, 12).map((entry) => (
          <li key={entry.key}>
            {entry.runbook}: {entry.start}-{entry.end} ({entry.phaseCount} phases)
          </li>
        ))}
      </ul>
    </section>
  );
}
