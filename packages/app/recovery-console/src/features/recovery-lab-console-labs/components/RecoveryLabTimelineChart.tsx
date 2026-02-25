import { useDeferredValue, useMemo } from 'react';
import type { LabTimelineBucket } from '../types';

export interface RecoveryLabTimelineChartProps {
  readonly points: readonly LabTimelineBucket[];
}

interface TimelinePoint {
  readonly value: string;
  readonly width: number;
  readonly startedAt: string;
  readonly kind: string;
  readonly diagnostics: readonly string[];
}

const normalizeWindow = (points: readonly LabTimelineBucket[]) =>
  points.map((point, index) => ({
    ...point,
    value: `${point.kind}#${index}`,
    width: Math.max(1, point.diagnostics.length),
    diagnostics: [...point.diagnostics],
  })) satisfies readonly TimelinePoint[];

export const RecoveryLabTimelineChart = ({ points }: RecoveryLabTimelineChartProps) => {
  const deferredPoints = useDeferredValue(points);
  const values = useMemo(() => normalizeWindow(deferredPoints), [deferredPoints]);

  return (
    <section className="timeline-chart">
      <h3>Timeline</h3>
      <div className="timeline-chart__rows">
        {values.length === 0 ? (
          <p>No timeline events yet.</p>
        ) : (
          values.map((point) => (
            <div key={point.value} className="timeline-row">
              <div className="timeline-row__meta">
                <time>{point.startedAt}</time>
                <span>{point.kind}</span>
                <span>{point.diagnostics.length} diagnostics</span>
              </div>
              <div className="timeline-row__bar">
                {Array.from({ length: point.width }).map((_, index) => (
                  <span key={`${point.value}-${index}`} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
};
