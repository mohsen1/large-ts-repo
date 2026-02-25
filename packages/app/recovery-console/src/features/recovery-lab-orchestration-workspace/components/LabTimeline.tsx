import { useMemo } from 'react';
import type { LabSignalEvent } from '../types';

type TimelinePoint = {
  readonly label: string;
  readonly value: number;
  readonly at: string;
};

interface LabTimelineProps {
  readonly signals: readonly LabSignalEvent[];
}

export const LabTimeline = ({ signals }: LabTimelineProps) => {
  const timeline: readonly TimelinePoint[] = useMemo(
    () =>
      signals.map((signal) => ({
        label: signal.label,
        value: signal.value,
        at: signal.at,
      })),
    [signals],
  );

  return (
    <section className="lab-timeline">
      <h3>Signal Timeline</h3>
      <ul>
        {timeline.map((point) => (
          <li key={`${point.label}-${point.at}`}>
            <strong>{point.label}</strong>
            <span>{point.value}</span>
            <time>{point.at}</time>
          </li>
        ))}
      </ul>
    </section>
  );
};
