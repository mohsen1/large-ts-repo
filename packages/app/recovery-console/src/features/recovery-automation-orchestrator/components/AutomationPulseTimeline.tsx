import type { CSSProperties } from 'react';
import { useMemo } from 'react';
import type { AutomationTelemetryDatum } from '../types';

interface AutomationPulseTimelineProps {
  readonly runId?: string;
  readonly metrics: readonly AutomationTelemetryDatum[];
}

type PulseStyles = CSSProperties & { '--value': string };

const scalePoint = (value: number): number => {
  return Math.max(0, Math.min(100, Math.round(value)));
};

const describeTrend = (values: readonly number[]) => {
  if (values.length < 2) {
    return 'steady';
  }
  const first = values[0];
  const last = values[values.length - 1];
  if (last > first + 10) {
    return 'rising';
  }
  if (first > last + 10) {
    return 'falling';
  }
  return 'steady';
};

export const AutomationPulseTimeline = ({ runId, metrics }: AutomationPulseTimelineProps) => {
  const points = useMemo(
    () =>
      metrics.map((metric, index) => ({
        ...metric,
        scaled: scalePoint(metric.value),
        index,
      })),
    [metrics],
  );
  const trend = useMemo(() => describeTrend(points.map((point) => point.value)), [points]);
  const maxValue = useMemo(() => points.reduce((acc, point) => Math.max(acc, point.scaled), 0), [points]);
  const minValue = useMemo(() => points.reduce((acc, point) => Math.min(acc, point.scaled), 100), [points]);
  const latest = points.at(-1)?.scaled ?? 0;
  const earliest = points.at(0)?.scaled ?? 0;
  const delta = latest - earliest;

  return (
    <section className="automation-pulse-timeline">
      <header>
        <h2>Pulse Timeline</h2>
        <p>{runId ?? 'pending run'}</p>
        <p>Trend: {trend}</p>
        <p>
          Min {minValue} / Max {maxValue} / Delta {delta}
        </p>
      </header>
      <div className="automation-pulse-grid">
        {points.length === 0 ? (
          <p>No metrics available</p>
        ) : (
          <ul>
            {points.map((point) => (
              <li
                key={`${point.at}-${point.index}`}
                style={
                  {
                    ['--value']: `${point.scaled}%`,
                  } as PulseStyles
                }
                className="automation-pulse-point"
              >
                <p>{point.metric}</p>
                <p>{point.value}</p>
                <p>{new Date(point.at).toISOString()}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};
