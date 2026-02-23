import { FC } from 'react';
import { ControlEvent } from '@service/recovery-cockpit-orchestrator';
import { PlanId } from '@domain/recovery-cockpit-models';

export type ReadinessSignalsTableProps = {
  readonly events: readonly ControlEvent[];
  readonly lines: ReadonlyArray<{ planId: PlanId; markerCount: number }>;
};

export const ReadinessSignalsTable: FC<ReadinessSignalsTableProps> = ({ events, lines }) => {
  const latestByPlan = lines.reduce<Record<string, number>>((acc, line) => {
    acc[line.planId] = line.markerCount;
    return acc;
  }, {});

  return (
    <section style={{ border: '1px solid #ddd', padding: 12, borderRadius: 8 }}>
      <h2>Signal health matrix</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>Plan</th>
            <th>Kind</th>
            <th>Run</th>
            <th>Notes</th>
            <th>Timeline markers</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={`${event.runId}-${event.note}`}>
              <td>{event.planId}</td>
              <td>{event.kind}</td>
              <td>{event.runId}</td>
              <td>{event.note}</td>
              <td>{latestByPlan[event.planId] ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};
