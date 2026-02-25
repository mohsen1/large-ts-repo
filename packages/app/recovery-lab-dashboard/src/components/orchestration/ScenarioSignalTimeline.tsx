import { useMemo } from 'react';
import type { OrchestrationSuiteRunOutput } from '../../services/orchestrationSuiteService';

interface ScenarioSignalTimelineProps {
  readonly outputs: readonly OrchestrationSuiteRunOutput[];
}

const buildTimeline = (outputs: readonly OrchestrationSuiteRunOutput[]) =>
  outputs
    .flatMap((output) =>
      output.result.summary.events.map((entry, index) => ({
        key: `${output.seed}:${index}`,
        timestamp: output.startedAt + index,
        plugin: entry.plugin,
        stage: entry.stage,
        status: entry.status,
      })),
    )
    .toSorted((left, right) => left.timestamp - right.timestamp);

export const ScenarioSignalTimeline = ({ outputs }: ScenarioSignalTimelineProps): React.JSX.Element => {
  const timeline = useMemo(() => buildTimeline(outputs), [outputs]);
  const summary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of timeline) {
      counts.set(event.status, (counts.get(event.status) ?? 0) + 1);
    }
    return [...counts.entries()].map(([status, count]) => `${status}:${count}`).join(' | ');
  }, [timeline]);

  return (
    <section style={{ border: '1px solid #d0d7de', borderRadius: 10, padding: 12 }}>
      <h3>Scenario signal timeline</h3>
      <p>{`events=${timeline.length} ${summary}`}</p>
      <ul style={{ maxHeight: 240, overflowY: 'auto', listStyle: 'none', padding: 0, margin: 0 }}>
        {timeline.length === 0 ? (
          <li>empty</li>
        ) : (
          timeline.map((entry) => (
            <li
              key={entry.key}
              style={{
                borderBottom: '1px solid #e5e7eb',
                padding: '6px 0',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr 1fr',
              }}
            >
              <span>{entry.timestamp}</span>
              <span>{entry.plugin}</span>
              <span>{entry.stage}</span>
              <span>{entry.status}</span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
};
