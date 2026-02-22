import { useMemo } from 'react';
import type { ContinuityWorkspace } from '@domain/continuity-lens';

interface ContinuityLensTimelineProps {
  readonly workspace?: ContinuityWorkspace;
}

const formatTick = (value: number): string => `${Math.max(0, Math.min(99, value))}%`;

export const ContinuityLensTimeline = ({ workspace }: ContinuityLensTimelineProps) => {
  const entries = useMemo(
    () =>
      workspace?.snapshot.signals.slice(0, 12).map((signal) => ({
        id: signal.id,
        at: new Date(signal.reportedAt).toLocaleTimeString(),
        severity: signal.severity,
        risk: signal.risk,
      })) ?? [],
    [workspace],
  );

  return (
    <section>
      <h2>Signal timeline</h2>
      <ul>
        {entries.length === 0 ? (
          <li>No data</li>
        ) : (
          entries.map((entry) => (
            <li key={entry.id}>
              <span>{entry.at}</span>
              {' · '}
              <strong>{formatTick(entry.severity)}</strong>
              {' · '}
              <code>{entry.risk}</code>
            </li>
          ))
        )}
      </ul>
    </section>
  );
};
