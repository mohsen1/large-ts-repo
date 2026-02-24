import { useMemo } from 'react';
import type { LabExecution } from '@domain/recovery-simulation-lab-core';

interface ScenarioTimelineProps {
  readonly executions: readonly LabExecution[];
  readonly onSelect: (executionId: string) => void;
  readonly selectedExecutionId: string | null;
}

export const runKey = (executionId: string, state: string): string => `${executionId}-${state}`;

export const ScenarioTimeline = ({ executions, onSelect, selectedExecutionId }: ScenarioTimelineProps) => {
  const ordered = useMemo(
    () => [...executions].toSorted((left, right) => right.startedAt.localeCompare(left.startedAt)),
    [executions],
  );

  if (ordered.length === 0) {
    return <p>no executions</p>;
  }

  return (
    <section>
      <h3>Scenario timeline</h3>
      <ol>
        {ordered.map((execution) => {
          const selected = execution.executionId === selectedExecutionId;
          return (
            <li
              key={execution.executionId}
              style={{
                marginBottom: 8,
                padding: 8,
                border: `1px solid ${selected ? '#1976d2' : '#e0e0e0'}`,
                borderRadius: 6,
                cursor: 'pointer',
              }}
              onClick={() => onSelect(execution.executionId)}
            >
              <div>{execution.executionId}</div>
              <div>{execution.tenant}</div>
              <div>{execution.lane}</div>
              <div>plugins={execution.pluginIds.length}</div>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
