import { useMemo, type ReactElement } from 'react';
import type { Result } from '@shared/result';

type TimelineEvent = {
  readonly at: string;
  readonly message: string;
  readonly severity: 'info' | 'ok' | 'warn' | 'error';
};

export interface RunTimelineProps {
  readonly events: readonly TimelineEvent[];
  readonly title: string;
}

const severityToIcon = (value: TimelineEvent['severity']): string => {
  switch (value) {
    case 'ok':
      return '✅';
    case 'warn':
      return '⚠️';
    case 'error':
      return '⛔';
    default:
      return 'ℹ️';
  }
};

const TimelineRow = ({ event }: { readonly event: TimelineEvent }) => {
  const icon = severityToIcon(event.severity);
  return (
    <li>
      <span>{icon}</span>
      <time>{new Date(event.at).toLocaleTimeString()}</time>
      <span>{event.message}</span>
    </li>
  );
};

export const RunTimeline = ({ events, title }: RunTimelineProps): ReactElement => {
  const sorted = useMemo(
    () => [...events].sort((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime()),
    [events],
  );

  return (
    <section>
      <h3>{title}</h3>
      <ol>
        {sorted.length === 0 ? (
          <li>No timeline events yet</li>
        ) : (
          sorted.map((event) => <TimelineRow key={`${event.at}-${event.message}`} event={event} />)
        )}
      </ol>
    </section>
  );
};

export const RunResultSummary = ({ result }: { readonly result: Result<{ id: string }, Error> }): ReactElement => {
  return <p>{result.ok ? `Run ${result.value.id} completed` : `Run failed: ${result.error.message}`}</p>;
};
