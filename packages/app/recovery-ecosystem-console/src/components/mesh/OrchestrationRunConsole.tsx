import { memo, useMemo } from 'react';
import type { EcosystemEvent } from '@domain/recovery-ecosystem-orchestrator-core';
import { isPluginCompletedEvent, isPluginStartedEvent } from '@domain/recovery-ecosystem-orchestrator-core';

interface RunConsoleProps {
  readonly events: readonly EcosystemEvent[];
  readonly maxRows?: number;
}

const sortEvents = (events: readonly EcosystemEvent[]): readonly EcosystemEvent[] =>
  [...events].toSorted((left, right) => left.at.localeCompare(right.at));

const summarize = (events: readonly EcosystemEvent[]) => {
  const started = events.filter(isPluginStartedEvent).length;
  const completed = events.filter(isPluginCompletedEvent).length;
  const derived = events.filter((event) => event.kind === 'signal.derived').length;
  return { started, completed, derived };
};

export const OrchestrationRunConsole = memo(function OrchestrationRunConsoleInner(props: RunConsoleProps) {
  const { events, maxRows = 30 } = props;
  const ordered = useMemo(() => sortEvents(events), [events]);
  const report = useMemo(() => summarize(ordered), [ordered]);

  return (
    <section>
      <h3>Run Console</h3>
      <p>{report.started} started · {report.completed} completed · {report.derived} derived</p>
      <ol>
        {ordered.slice(0, maxRows).map((event) => (
          <li key={event.eventId}>
            <strong>{event.kind}</strong> {event.pluginId} at {event.stage}
          </li>
        ))}
      </ol>
    </section>
  );
});
