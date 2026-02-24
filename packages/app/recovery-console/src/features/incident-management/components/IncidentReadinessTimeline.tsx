import type { ReactElement } from 'react';

interface TimelinePoint {
  readonly at: string;
  readonly score: number;
}

interface IncidentReadinessTimelineProps {
  readonly title: string;
  readonly points: readonly TimelinePoint[];
}

export const IncidentReadinessTimeline = ({ title, points }: IncidentReadinessTimelineProps): ReactElement => {
  const sorted = [...points].sort((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime());
  return (
    <section>
      <h3>{title}</h3>
      <div>
        {sorted.map((point) => (
          <div key={point.at} style={{ marginBottom: '0.5rem' }}>
            <span>{point.at}</span>
            <strong style={{ marginLeft: '0.75rem' }}>{point.score}</strong>
          </div>
        ))}
      </div>
    </section>
  );
};
