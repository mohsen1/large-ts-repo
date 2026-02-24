import { type ReactElement, useMemo } from 'react';
import type { IncidentLabRun } from '@domain/recovery-incident-lab-core';

interface SignalRow {
  readonly at: string;
  readonly status: string;
  readonly value: string;
}

interface Props {
  readonly run?: IncidentLabRun;
}

const stepRows = (run?: IncidentLabRun): readonly SignalRow[] => {
  if (!run) {
    return [];
  }

  return run.results.map((result, index: number) => ({
    at: result.startAt,
    status: result.status,
    value: `step ${index + 1} ${String(result.stepId)}`,
  }));
};

export const ScenarioLabTimeline = ({ run }: Props): ReactElement => {
  const rows = useMemo(() => stepRows(run), [run]);

  return (
    <section className="scenario-lab-timeline">
      <h3>Execution timeline</h3>
      <ul>
        {rows.length === 0 ? (
          <li>empty</li>
        ) : (
          rows.map((row: SignalRow, index: number) => (
            <li key={`${row.at}-${index}`}>
              <strong>{row.at}</strong>
              <span>{row.status}</span>
              <em>{row.value}</em>
            </li>
          ))
        )}
      </ul>
    </section>
  );
};
