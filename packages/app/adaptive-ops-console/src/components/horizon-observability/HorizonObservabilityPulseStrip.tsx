import { useMemo } from 'react';
import type { ObservabilitySummary } from '@service/recovery-horizon-observability-orchestrator';

interface HorizonObservabilityPulseStripProps {
  readonly profiles: readonly string[];
  readonly refreshMs: number;
  readonly summaries: readonly ObservabilitySummary[];
  readonly onRefresh: (ms: number) => void;
}

interface TrendEntry {
  readonly value: number;
  readonly label: string;
}

const toTrend = (summaries: readonly ObservabilitySummary[]) =>
  summaries.map((summary, index) => ({
    value: summary.totalSignals,
    label: `#${index}`,
  })) as TrendEntry[];

const toRange = (trends: readonly TrendEntry[]) => {
  const max = Math.max(...trends.map((entry) => entry.value), 1);
  return trends.map((entry) => (entry.value / max) * 100);
};

export const HorizonObservabilityPulseStrip = ({
  profiles,
  refreshMs,
  summaries,
  onRefresh,
}: HorizonObservabilityPulseStripProps) => {
  const trend = useMemo(() => toTrend(summaries), [summaries]);
  const range = useMemo(() => toRange(trend), [trend]);

  return (
    <section className="horizon-observability-pulse-strip">
      <h4>Pulse strip</h4>
      <div className="controls">
        <label>
          Refresh (ms)
          <input
            type="range"
            min={250}
            max={5000}
            value={refreshMs}
            onChange={(event) => onRefresh(Number(event.target.value))}
          />
        </label>
        <ul>
          {profiles.map((profile) => (
            <li key={profile}>{profile}</li>
          ))}
        </ul>
      </div>
      <div className="trend-row">
        {range.map((value, index) => {
          const entry = trend[index];
          return (
            <div
              key={`${entry.label}:${value}`}
              className="trend-bar"
              title={`${entry.label}: ${entry.value}`}
              style={{ width: `${Math.max(8, value)}px`, height: `${Math.max(6, value / 2)}px` }}
            />
          );
        })}
      </div>
      <p className="trend-summary">
        Signals in last window: {summaries[summaries.length - 1]?.totalSignals ?? 0}
      </p>
    </section>
  );
};
