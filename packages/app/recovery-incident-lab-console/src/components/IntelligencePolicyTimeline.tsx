import { type ReactElement } from 'react';
import type { SignalEvent } from '@domain/recovery-lab-intelligence-core';
import { extractMode } from '@domain/recovery-lab-intelligence-core/src/telemetry';

interface IntelligencePolicyTimelineProps {
  readonly events: readonly SignalEvent[];
}

type TimelineRow = {
  readonly at: number;
  readonly count: number;
  readonly mode: string;
};

export const IntelligencePolicyTimeline = ({ events }: IntelligencePolicyTimelineProps): ReactElement => {
  const rows = Object.entries(
    events.reduce<Record<string, number>>((acc, event) => {
      const mode = extractMode(event);
      acc[mode] = (acc[mode] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .map(([mode, count]) => ({
      at: Date.parse(events.at(-1)?.at ?? new Date().toISOString()),
      count,
      mode,
    }))
    .toSorted((left, right) => left.count - right.count);

  return (
    <section className="intelligence-policy-timeline">
      <h3>Policy timeline</h3>
      <ol>
        {rows.map((row) => (
          <li key={`${row.mode}-${row.count}`}>
            <strong>{row.mode}</strong>
            <span>{row.count}</span>
            <time>{new Date(row.at).toISOString()}</time>
          </li>
        ))}
      </ol>
      <p>
        total={events.length} uniqueModes={rows.length}
      </p>
    </section>
  );
};
