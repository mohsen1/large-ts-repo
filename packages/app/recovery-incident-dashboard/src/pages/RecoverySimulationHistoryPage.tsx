import { useMemo } from 'react';
import type { SimulationRunRecord } from '@domain/recovery-simulation-core';
import { reportTelemetry } from '@service/recovery-simulation-orchestrator';

export interface RecoverySimulationHistoryPageProps {
  readonly runs: readonly SimulationRunRecord[];
}

export const RecoverySimulationHistoryPage = ({ runs }: RecoverySimulationHistoryPageProps) => {
  const grouped = useMemo(() => {
    const byState = new Map<string, SimulationRunRecord[]>();
    for (const run of runs) {
      const list = byState.get(run.state) ?? [];
      byState.set(run.state, [...list, run]);
    }
    return byState;
  }, [runs]);

  return (
    <main className="simulation-history-page">
      <h1>Simulation History</h1>
      {[...grouped.entries()].map(([state, values]) => (
        <section key={state}>
          <h2>{state}</h2>
          <ul>
            {values.map((run) => (
              <li key={run.id}>
                <article>
                  <strong>{run.id}</strong>
                  <p>Scenario: {run.scenarioId}</p>
                  <p>Steps: {run.executedSteps.length}</p>
                  <p>{reportTelemetry(run)}</p>
                </article>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
};
