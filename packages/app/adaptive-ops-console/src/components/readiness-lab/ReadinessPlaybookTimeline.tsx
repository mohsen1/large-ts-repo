import { type JSX } from 'react';
import type { PlaybookDefinition } from '@domain/recovery-readiness/playbook-models';
import type { HealthSeriesPoint } from '../../hooks/useReadinessPlaybook';

interface ReadinessPlaybookTimelineProps {
  playbook: PlaybookDefinition;
  runHistory: readonly HealthSeriesPoint[];
  title?: string;
  compact?: boolean;
}

interface TimelineSegment {
  bucket: string;
  completed: number;
  failed: number;
  label: string;
  widthPercent: number;
  status: 'healthy' | 'degraded' | 'flat';
}

const classifySegment = (segment: HealthSeriesPoint): TimelineSegment['status'] => {
  if (segment.failed === 0 && segment.completed > 0) return 'healthy';
  if (segment.failed > segment.completed) return 'degraded';
  return 'flat';
};

const normalizeBucket = (bucket: string): string => {
  const parsed = new Date(bucket);
  return `${parsed.getUTCHours()}:${parsed.getUTCMinutes().toString().padStart(2, '0')}`;
};

const colorByStatus: Record<TimelineSegment['status'], string> = {
  healthy: '#2f9e44',
  degraded: '#f03e3e',
  flat: '#f59f00',
};

const buildSegments = (history: readonly HealthSeriesPoint[]): TimelineSegment[] => {
  const maxTotal = Math.max(1, ...history.map((row) => Math.max(row.completed + row.failed, 1)));

  return history.map((row, index) => {
    const total = row.completed + row.failed;
    const widthPercent = (total / maxTotal) * 100;
    return {
      bucket: row.bucket,
      completed: row.completed,
      failed: row.failed,
      label: `${normalizeBucket(row.bucket)} • ${index + 1}`,
      widthPercent,
      status: classifySegment(row),
    };
  });
};

const TimelineRow = ({ row }: { row: TimelineSegment }): JSX.Element => {
  return (
    <div
      title={`${row.label}: completed=${row.completed}, failed=${row.failed}`}
      style={{
        borderRadius: 6,
        padding: '5px 10px',
        marginBottom: 6,
        width: `${row.widthPercent}%`,
        minWidth: 80,
        color: 'white',
        background: colorByStatus[row.status],
      }}
    >
      <strong>{row.label}</strong>
      <span style={{ marginLeft: 8 }}>
        {row.completed}/{row.completed + row.failed}
      </span>
    </div>
  );
};

export const ReadinessPlaybookTimeline: React.FC<ReadinessPlaybookTimelineProps> = ({
  playbook,
  runHistory,
  title,
  compact = false,
}) => {
  const segments = buildSegments(runHistory);
  const headline = title ?? `${playbook.name} timeline`;

  if (runHistory.length === 0) {
    return (
      <section style={{ border: '1px solid #dee2e6', borderRadius: 8, padding: 12 }}>
        <h4>{headline}</h4>
        <p>No runs to display</p>
      </section>
    );
  }

  return (
    <section
      style={{
        border: '1px solid #ced4da',
        borderRadius: 10,
        padding: 12,
        background: 'linear-gradient(135deg, rgba(240, 244, 248, 0.5), rgba(255, 255, 255, 0.95))',
        opacity: compact ? 0.95 : 1,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h4>{headline}</h4>
      </div>
      <div>{segments.map((row) => (
        <TimelineRow key={row.bucket} row={row} />
      ))}</div>
    </section>
  );
};
