import { useMemo, type ReactElement } from 'react';
import type { LatticeOrchestratorEvent } from '@service/recovery-lattice-orchestrator';

type TraceEvent = {
  readonly bucket: 'info' | 'warn' | 'error';
  readonly payload: string;
  readonly at: string;
  readonly type: LatticeOrchestratorEvent['type'];
};

type Props = {
  readonly events: readonly LatticeOrchestratorEvent[];
  readonly maxRows?: number;
  readonly onTrim: () => void;
};

const eventKind = (event: LatticeOrchestratorEvent): TraceEvent['bucket'] => {
  if (event.type === 'finalized') return 'info';
  if (event.type === 'stage.failed') return 'error';
  return 'warn';
};

const severityClass = (bucket: TraceEvent['bucket']): string => {
  if (bucket === 'error') return 'error';
  if (bucket === 'warn') return 'warn';
  return 'info';
};

export const LatticeEventStream = ({
  events,
  maxRows = 60,
  onTrim,
}: Props): ReactElement => {
  const normalized = useMemo(
    () =>
      events
        .toSorted((left, right) => right.at.localeCompare(left.at))
        .slice(0, maxRows)
        .map((entry) => {
          const bucket = eventKind(entry);
          return {
            at: entry.at,
            bucket,
            type: entry.type,
            payload: JSON.stringify(entry.details),
          };
        }),
    [events, maxRows],
  );

  return (
    <section className="lattice-event-stream">
      <header>
        <h3>Event Stream</h3>
        <button type="button" onClick={onTrim}>trim</button>
      </header>
      <ul>
        {normalized.map((entry) => (
          <li key={`${entry.at}-${entry.type}`} className={severityClass(entry.bucket)}>
            <time>{entry.at}</time>
            <strong>{entry.type}</strong>
            <span>{entry.payload}</span>
          </li>
        ))}
        {normalized.length === 0 ? <li className="empty">No events captured</li> : null}
      </ul>
    </section>
  );
};
