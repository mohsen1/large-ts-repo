import { memo, type ReactElement } from 'react';
import type { AnalyticsStoreSignalEvent } from '@data/recovery-ecosystem-analytics-store';

export interface SignalTimelinePanelProps {
  readonly events: readonly AnalyticsStoreSignalEvent[];
  readonly namespace: string;
  readonly onSelect: (signature: string) => void;
}

export interface TimelineEventView {
  readonly signature: string;
  readonly at: string;
  readonly namespace: string;
  readonly kind: string;
  readonly id: string;
}

const toSignature = (entry: AnalyticsStoreSignalEvent): string =>
  `${entry.kind}::${entry.id}::${entry.window}`;

const buildEntries = (events: readonly AnalyticsStoreSignalEvent[]): readonly TimelineEventView[] =>
  events.map((entry) => ({
    signature: toSignature(entry),
    at: entry.at,
    namespace: entry.namespace,
    kind: entry.kind,
    id: entry.id,
  }));

export const SignalTimelinePanel = memo(({ events, namespace, onSelect }: SignalTimelinePanelProps): ReactElement => {
  const lines = buildEntries(events)
    .filter((entry) => entry.namespace === namespace)
    .toSorted((left, right) => left.at.localeCompare(right.at));

  return (
    <section>
      <h3>Signal Timeline</h3>
      <ul>
        {lines.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => onSelect(entry.signature)}
            >
              {entry.signature}
            </button>
            <span>{entry.at}</span>
            <small>{entry.kind}</small>
          </li>
        ))}
      </ul>
      <p>windowed events: {lines.length}</p>
    </section>
  );
});

export const createTimelineSummary = (events: readonly AnalyticsStoreSignalEvent[]): string => {
  const namespace = new Set<string>(events.map((entry) => entry.namespace));
  const unique = namespace.size;
  const sample = events.slice(0, 1)[0]?.kind ?? 'none';
  return `${events.length}/${unique}/${sample}`;
};
