import { useMemo } from 'react';

interface TimelinePoint {
  label: string;
  startedAt: string;
  completed: boolean;
  score: number;
}

interface PolicyExecutionTimelineProps {
  points: readonly TimelinePoint[];
}

const fmtScore = (value: number): string => `${Math.max(0, Math.min(100, value)).toFixed(1)}%`;

const sortPoints = (points: readonly TimelinePoint[]): TimelinePoint[] =>
  [...points].sort((left, right) => left.startedAt.localeCompare(right.startedAt));

export const PolicyExecutionTimeline = ({ points }: PolicyExecutionTimelineProps) => {
  const ordered = useMemo(() => sortPoints(points), [points]);

  if (ordered.length === 0) {
    return <p>No timeline points yet.</p>;
  }

  return (
    <div>
      <h3>Execution Timeline</h3>
      <ol>
        {ordered.map((point) => (
          <li key={`${point.label}:${point.startedAt}`}> 
            <span style={{ fontWeight: 'bold' }}>{point.label}</span>
            <span> started={point.startedAt} </span>
            <span> score={fmtScore(point.score)} </span>
            <span> completed={point.completed ? 'yes' : 'no'} </span>
          </li>
        ))}
      </ol>
    </div>
  );
};
