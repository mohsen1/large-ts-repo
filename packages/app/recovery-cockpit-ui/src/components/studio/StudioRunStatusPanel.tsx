import { FC } from 'react';
import type { StudioRunState } from '@service/recovery-orchestration-studio-engine';

export type StudioRunStatusPanelProps = {
  readonly run: StudioRunState;
  readonly compact?: boolean;
};

const percent = (value: number): string => `${Math.max(0, Math.min(100, value)).toFixed(2)}%`;

const collectWarnings = (run: StudioRunState): ReadonlyArray<string> => {
  const errors = run.ticks
    .filter((tick) => tick.status === 'failed' || tick.status === 'blocked')
    .map((tick) => tick.pluginId)
    .toSorted((left, right) => left.localeCompare(right));
  return errors.length ? errors : ['no warnings'];
};

const tickPhaseBuckets = (run: StudioRunState): ReadonlyArray<{ readonly phase: string; readonly size: number }> => {
  const map = new Map<string, number>();
  for (const tick of run.ticks) {
    const value = map.get(tick.phase) ?? 0;
    map.set(tick.phase, value + 1);
  }
  return [...map.entries()].map(([phase, size]) => ({ phase, size }));
};

export const StudioRunStatusPanel: FC<StudioRunStatusPanelProps> = ({ run, compact = false }) => {
  const warnings = collectWarnings(run);
  const buckets = tickPhaseBuckets(run);
  const ratio = run.ticks.length > 0 ? run.ticks.filter((tick) => tick.status === 'finished').length / run.ticks.length : 0;

  return (
    <article style={{ border: '1px solid #ccc', borderRadius: 10, padding: compact ? 12 : 16, background: '#0b1020', color: '#f8f9ff' }}>
      <h4 style={{ marginTop: 0 }}>{run.sessionId}</h4>
      <p>Status: <strong>{run.status}</strong></p>
      <p>Complete: {percent(ratio * 100)}</p>
      <p>Telemetry: {run.telemetry.length}</p>
      <ul style={{ paddingLeft: 16 }}>
        {buckets.map((bucket) => (
          <li key={bucket.phase}>
            {bucket.phase}: {bucket.size}
          </li>
        ))}
      </ul>
      <h5>Warnings</h5>
      <ul>
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </article>
  );
};
