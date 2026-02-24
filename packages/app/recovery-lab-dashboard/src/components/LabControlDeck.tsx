import { useMemo } from 'react';
import { useLabRunner } from '../hooks/useLabRunner';
import type { ScenarioSummary } from '../services/labAdapter';
import { runKey } from './ScenarioTimeline';

interface LabControlDeckProps {
  readonly tenant: string;
  readonly scenarioId: string;
  readonly summaries: readonly ScenarioSummary[];
}

const laneOrder = ['simulate', 'verify', 'restore'] as const;

type Lane = (typeof laneOrder)[number];

export const LabControlDeck = ({ tenant, scenarioId, summaries }: LabControlDeckProps) => {
  const runner = useLabRunner({ tenant, scenarioId });

  const lanes = useMemo(
    () => summaries
      .map((entry) => entry.lane)
      .filter((lane): lane is Lane => laneOrder.includes(lane as Lane)),
    [summaries],
  );

  return (
    <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
      <h3>Lab control deck</h3>
      <p>tenant={tenant}</p>
      <p>scenario={scenarioId}</p>
      <p>running={runner.running ? 'true' : 'false'}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {lanes.toSorted().map((lane) => (
          <button key={runKey(scenarioId, lane)} type="button" onClick={() => runner.start(lane)}>
            run:{lane}
          </button>
        ))}
      </div>
      <p>history={runner.history.length}</p>
      <ul>
        {runner.history.map((entry) => (
          <li key={entry}>{entry}</li>
        ))}
      </ul>
      {runner.result ? <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(runner.result, null, 2)}</pre> : null}
    </section>
  );
};
