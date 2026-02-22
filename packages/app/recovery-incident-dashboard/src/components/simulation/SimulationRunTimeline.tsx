import { useMemo } from 'react';
import type { SimulationRunRecord } from '@domain/recovery-simulation-core';

export interface SimulationRunTimelineProps {
  readonly runs: readonly SimulationRunRecord[];
  readonly selectedRunId: string | null;
  readonly onSelectRun: (runId: string) => void;
}

const toStatusColor = (state: SimulationRunRecord['state']): 'green' | 'yellow' | 'red' | 'blue' => {
  if (state === 'completed') return 'green';
  if (state === 'executing') return 'blue';
  if (state === 'failed') return 'red';
  return 'yellow';
};

export const SimulationRunTimeline = ({ runs, selectedRunId, onSelectRun }: SimulationRunTimelineProps) => {
  const items = useMemo(() =>
    runs.map((run) => ({
      id: run.id,
      state: run.state,
      color: toStatusColor(run.state),
      steps: run.executedSteps.length,
      risk: run.residualRiskScore.toFixed(2),
      selected: run.id === selectedRunId,
    })),
  [runs, selectedRunId]);

  return (
    <section className="simulation-run-timeline">
      <h3>Simulation Runs</h3>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <button
              onClick={() => {
                onSelectRun(item.id);
              }}
              className={`run-chip run-chip--${item.color} ${item.selected ? 'is-selected' : ''}`}
            >
              <span>{item.id}</span>
              <strong>{item.state}</strong>
              <small>{item.steps} steps</small>
              <small>risk {item.risk}</small>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
