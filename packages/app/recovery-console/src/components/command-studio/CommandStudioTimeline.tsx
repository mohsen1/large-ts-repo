import { useMemo } from 'react';

interface StepPoint {
  readonly at: string;
  readonly commandId: string;
  readonly blockerCount: number;
  readonly metricCount: number;
}

interface CommandStudioTimelineProps {
  readonly points: readonly StepPoint[];
}

export const CommandStudioTimeline = ({ points }: CommandStudioTimelineProps) => {
  const ordered = useMemo(() => [...points].sort((left, right) => left.at.localeCompare(right.at)), [points]);

  return (
    <div className="command-studio-timeline">
      <h3>Timeline</h3>
      <ol>
        {ordered.map((point) => (
          <li key={`${point.at}-${point.commandId}`}>
            <span>{point.at}</span>
            <strong>{point.commandId}</strong>
            <small>blockers: {point.blockerCount}</small>
            <small>metrics: {point.metricCount}</small>
          </li>
        ))}
        {!ordered.length && <li>No simulation steps yet</li>}
      </ol>
    </div>
  );
};
