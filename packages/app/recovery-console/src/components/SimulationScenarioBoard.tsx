import { useMemo } from 'react';

import type { SimulationSummary } from '@domain/recovery-simulation-planning';
import type { SimulationWorkspace } from '@domain/recovery-simulation-planning';

interface SimulationScenarioBoardProps {
  readonly title: string;
  readonly summaries: readonly SimulationSummary[];
  readonly workspace?: SimulationWorkspace;
  readonly onSelect: (summary: SimulationSummary) => void;
}

export const SimulationScenarioBoard = ({
  title,
  summaries,
  workspace,
  onSelect,
}: SimulationScenarioBoardProps) => {
  const list = useMemo(
    () => summaries.map((summary) => ({
      summary,
      isHealthy: summary.status === 'ok',
      risk: summary.failureCount,
    })),
    [summaries],
  );

  return (
    <article className="simulation-board">
      <h3>{title}</h3>
      <p>Run id: {workspace?.runId ?? 'n/a'}</p>
      <ul>
        {list.map((row) => (
          <li key={row.summary.id}>
            <button type="button" onClick={() => onSelect(row.summary)}>
              <span>{row.summary.scenarioId}</span>
              <span>{row.isHealthy ? 'OK' : 'WARN'}</span>
              <span>{row.risk} violations</span>
            </button>
          </li>
        ))}
      </ul>
    </article>
  );
};
