import { Fragment } from 'react';
import type { ReactElement } from 'react';
import type { TimelinePoint } from '../types';

export interface ChronicleTopologyPanelProps {
  readonly title: string;
  readonly points: readonly TimelinePoint[];
}

const formatAxis = (point: TimelinePoint): string => `${point.label}: ${point.score}`;

export const ChronicleTopologyPanel = ({ title, points }: ChronicleTopologyPanelProps): ReactElement => {
  return (
    <section className="chronicle-topology-panel">
      <h3>{title}</h3>
      <ol>
        {points.map((point) => (
          <li key={point.label} className={point.status}>
            <span>{formatAxis(point)}</span>
            <strong>{point.status}</strong>
          </li>
        ))}
      </ol>
    </section>
  );
};

export const ChronicleTopologyStrip = ({ points }: { points: readonly TimelinePoint[] }): ReactElement => {
  const normalized = points.toSorted((left, right) => left.score - right.score);
  return (
    <div className="chronicle-topology-strip">
      {normalized.map((point) => (
        <Fragment key={point.label}>
          <span>{point.label}</span>
          <progress value={point.score} max={100} />
        </Fragment>
      ))}
    </div>
  );
};
