import { useMemo } from 'react';
import type { CommandRunbook, RecoverySimulationResult, OrchestrationPlan } from '@domain/recovery-stress-lab';

interface Props {
  readonly plan: OrchestrationPlan | null;
  readonly simulation: RecoverySimulationResult | null;
  readonly runbooks: readonly CommandRunbook[];
}

export const StressLabTopologyBoard = ({ plan, simulation, runbooks }: Props) => {
  const labels = useMemo(() => {
    return (plan?.runbooks ?? []).map((runbook) => ({
      runbookId: runbook.id,
      label: runbook.name,
      confidence: runbook.steps.length,
    }));
  }, [plan]);

  const risk = simulation?.riskScore ?? 0;
  const sla = simulation?.slaCompliance ?? 0;

  return (
    <section>
      <h2>Topology Board</h2>
      <p>{`Plan windows: ${plan?.schedule.length ?? 0}`}</p>
      <p>{`Tick count: ${simulation?.ticks.length ?? 0}`}</p>
      <p>{`Risk: ${risk.toFixed(2)} / SLA: ${(sla * 100).toFixed(1)}%`}</p>
      <ul>
        {labels.map((entry) => (
          <li key={entry.runbookId}>
            {entry.label}
            <strong>{` (${entry.confidence} steps)`}</strong>
          </li>
        ))}
      </ul>
      {runbooks.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Runbook</th>
              <th>Owner</th>
              <th>Owner Team</th>
            </tr>
          </thead>
          <tbody>
            {runbooks.map((runbook) => (
              <tr key={runbook.id}>
                <td>{runbook.name}</td>
                <td>{runbook.ownerTeam}</td>
                <td>{runbook.cadence.weekday}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
};
