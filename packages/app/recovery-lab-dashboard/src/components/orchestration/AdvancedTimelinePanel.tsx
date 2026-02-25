import { useMemo } from 'react';
import type { PipelineRecord } from '@shared/stress-lab-runtime/iterative-pipeline';
import {
  summarizeTimeline,
  type TimelineLane,
  type TimelineMarker,
  type TimelinePriority,
  type TimelineSequence,
} from '@shared/stress-lab-runtime/orchestration-timeline';

interface AdvancedTimelinePanelProps {
  readonly tenant: string;
  readonly namespace: string;
  readonly timeline: TimelineSequence<unknown>;
  readonly pipelineRecords: readonly PipelineRecord<unknown>[];
  readonly onFilter?: (marker: TimelineMarker) => void;
}

type TimelineRow = {
  readonly markerId: string;
  readonly lane: TimelineLane;
  readonly title: string;
  readonly at: string;
  readonly severity: TimelineMarker['severity'];
  readonly priority: TimelinePriority;
};

const severityClass = (severity: TimelineMarker['severity']) => {
  switch (severity) {
    case 'error':
      return 'timeline-error';
    case 'warn':
      return 'timeline-warning';
    case 'info':
      return 'timeline-info';
    default:
      return 'timeline-trace';
  }
};

export const AdvancedTimelinePanel = ({
  tenant,
  namespace,
  timeline,
  pipelineRecords,
  onFilter,
}: AdvancedTimelinePanelProps) => {
  const summary = useMemo(() => summarizeTimeline(timeline), [timeline]);
const rows = useMemo<TimelineRow[]>(() => {
    return timeline.map((entry) => ({
      markerId: entry.marker.id,
      lane: entry.marker.lane,
      title: entry.marker.title,
      at: new Date(entry.marker.at).toLocaleTimeString(),
      severity: entry.marker.severity,
      priority: entry.marker.priority,
    }));
  }, [timeline]);

const recordRows = useMemo(
    () =>
      pipelineRecords.map<TimelineRow>((record) => ({
        markerId: record.step,
        lane: 'telemetry',
        title: `${record.elapsedMs}ms`,
        at: new Date(record.timestamp).toLocaleString(),
        severity: record.elapsedMs > 5 ? 'warn' : 'info',
        priority: 0 as TimelinePriority,
      })),
    [pipelineRecords],
  );

  const combined = [...rows, ...recordRows].toSorted((left, right) => left.at.localeCompare(right.at));

  return (
    <section style={{ border: '1px solid #d1d5db', padding: 12, borderRadius: 12, background: '#0b1020', color: '#e5e7eb' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>Advanced Timeline</h3>
        <small style={{ opacity: 0.8 }}>{tenant}</small>
      </header>
      <p style={{ marginTop: 0, opacity: 0.85 }}>namespace: {namespace}</p>
      <p style={{ marginBottom: 12, fontSize: 12, opacity: 0.75 }}>
        markers={summary.length} lanes={summary.lanes.join(',')} range={summary.range?.[0]?.toString() ?? 'n/a'}
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
        {combined.map((entry) => (
          <li
            key={entry.markerId}
            className={severityClass(entry.severity)}
            style={{
              padding: 10,
              borderRadius: 8,
              border: '1px solid rgba(147, 197, 253, 0.3)',
              background: entry.severity === 'error' ? '#3f1d1d' : 'rgba(15, 23, 42, 0.7)',
              display: 'grid',
              gridTemplateColumns: '1fr auto',
            }}
          >
            <button
              type="button"
              onClick={() => onFilter?.({
                id: entry.markerId,
                at: Date.now(),
                title: entry.title,
                lane: entry.lane,
                severity: entry.severity,
                priority: entry.priority,
              })}
              style={{ border: 0, background: 'none', color: 'inherit', textAlign: 'left', padding: 0 }}
            >
              <div>
                <strong>{entry.markerId}</strong>
                <div style={{ opacity: 0.8, fontSize: 12 }}>{entry.title}</div>
              </div>
            </button>
            <span style={{ fontFamily: 'monospace', opacity: 0.8 }}>{entry.at}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};
