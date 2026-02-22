import { useMemo } from 'react';

export interface RunVelocityPoint {
  readonly timestamp: string;
  readonly value: number;
}

interface RunVelocityTimelineProps {
  readonly title: string;
  readonly points: readonly RunVelocityPoint[];
  readonly baseline: number;
}

const formatValue = (value: number): string => `${(value * 100).toFixed(2)}%`;

export const RunVelocityTimeline = ({ title, points, baseline }: RunVelocityTimelineProps) => {
  const sorted = useMemo(() => [...points].sort((left, right) => left.timestamp.localeCompare(right.timestamp)), [points]);
  const max = Math.max(...points.map((point) => point.value), baseline, 1);
  return (
    <section className="run-velocity-timeline">
      <header>
        <h2>{title}</h2>
        <strong>baseline {formatValue(baseline)}</strong>
      </header>
      <ul>
        {sorted.map((point) => {
          const width = Math.round((point.value / max) * 100);
          return (
            <li key={`${point.timestamp}-${point.value}`}>
              <span>{new Date(point.timestamp).toLocaleTimeString()}</span>
              <span className="metric">{formatValue(point.value)}</span>
              <span>
                <progress value={width} max={100} />
                {width}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
