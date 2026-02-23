import { useMemo } from 'react';
import type { RecoverySimulationResult } from '@domain/recovery-stress-lab';

interface Props {
  readonly simulation: RecoverySimulationResult | null;
  readonly maxRows?: number;
}

export const StressLabHealthTimeline = ({ simulation, maxRows = 12 }: Props) => {
  const rows = useMemo(() => {
    return simulation ? simulation.ticks.slice(0, maxRows) : [];
  }, [simulation, maxRows]);

  if (!simulation) {
    return <p>No simulation data.</p>;
  }

  return (
    <section>
      <h2>Health Timeline</h2>
      <p>{`Duration minutes: ${simulation.ticks.length}`}</p>
      <ul>
        {rows.map((tick, index) => {
          const blockedCount = tick.blockedWorkloads.length;
          return (
            <li key={tick.timestamp}>
              <strong>{index}</strong>
              <span>{tick.timestamp}</span>
              <span>{`active=${tick.activeWorkloads}`}</span>
              <span>{`blocked=${blockedCount}`}</span>
              <span>{`confidence=${tick.confidence.toFixed(4)}`}</span>
            </li>
          );
        })}
      </ul>
      <p>{`Risk score: ${simulation.riskScore.toFixed(2)}`}</p>
      <p>{`SLA score: ${(simulation.slaCompliance * 100).toFixed(1)}%`}</p>
      <p>{`Notes: ${simulation.notes.length}`}</p>
    </section>
  );
};
