import { type ReactElement } from 'react';
import type { SignalEvent } from '@domain/recovery-lab-intelligence-core';
import { summarizeEvents } from '@domain/recovery-lab-intelligence-core';

interface IntelligenceSignalStripProps {
  readonly events: readonly SignalEvent[];
  readonly selectedSeverity?: SignalEvent['severity'];
  readonly onFocus?: (event: SignalEvent) => void;
}

export const IntelligenceSignalStrip = ({
  events,
  selectedSeverity,
  onFocus,
}: IntelligenceSignalStripProps): ReactElement => {
  const summary = summarizeEvents(events);
  const visible = selectedSeverity ? events.filter((event) => event.severity === selectedSeverity) : events;
  return (
    <section className="intelligence-signal-strip">
      <h3>Signal strip</h3>
      <dl className="intelligence-signal-strip__summary">
        <div>
          <dt>Warnings</dt>
          <dd>{summary.warnings}</dd>
        </div>
        <div>
          <dt>Errors</dt>
          <dd>{summary.errors}</dd>
        </div>
        <div>
          <dt>Critical</dt>
          <dd>{summary.criticial}</dd>
        </div>
      </dl>
      <ul className="intelligence-signal-strip__list">
        {visible.map((event) => (
          <li key={`${event.source}-${event.at}-${event.severity}`}>
            <button
              type="button"
              onClick={() => onFocus?.(event)}
              className={`intelligence-signal-strip__item intelligence-signal-strip__item--${event.severity}`}
            >
              <span>{event.source}</span>
              <span>{event.severity}</span>
              <time>{event.at}</time>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
