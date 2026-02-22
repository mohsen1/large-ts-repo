import { useMemo, useState } from 'react';

import { useRecoveryConsoleTelemetry, type SimulationRecordFilter } from '../hooks/useRecoveryConsoleTelemetry';
import type { SimulationSummary } from '@domain/recovery-simulation-planning';

type SimulationStatus = 'ok' | 'degraded' | 'failed' | 'all';

interface RecoverySimulationHistoryPageProps {
  readonly tenant: string;
  readonly defaultFilter?: SimulationRecordFilter;
}

export const RecoverySimulationHistoryPage = ({
  tenant,
  defaultFilter,
}: RecoverySimulationHistoryPageProps) => {
  const [selectedStatus, setSelectedStatus] = useState<SimulationStatus>('all');

  const filter = useMemo<SimulationRecordFilter>(() => {
    const status = selectedStatus === 'all' ? undefined : [selectedStatus];
    return {
      ...defaultFilter,
      tenant,
      status,
    };
  }, [defaultFilter, selectedStatus, tenant]);

  const telemetry = useRecoveryConsoleTelemetry({
    simulations: [],
    filter,
  });

  const rows: readonly SimulationSummary[] = telemetry.recent;
  return (
    <section className="history-page">
      <header>
        <h2>Recovery simulation history</h2>
        <label>
          Filter status:
          <select
            value={selectedStatus}
            onChange={(event) => setSelectedStatus(event.currentTarget.value as SimulationStatus)}
          >
            <option value="all">all</option>
            <option value="ok">ok</option>
            <option value="degraded">degraded</option>
            <option value="failed">failed</option>
          </select>
        </label>
      </header>
      <ul>
        {rows.map((item) => (
          <li key={item.id}>
            <span>{item.scenarioId}</span>
            <span>{item.status}</span>
            <span>{item.score}</span>
            <span>{item.recommendedActions.length}</span>
          </li>
        ))}
      </ul>
      <footer>
        <p>best score: {telemetry.trend.best?.score ?? 'n/a'}</p>
        <p>worst score: {telemetry.trend.worst?.score ?? 'n/a'}</p>
        <p>avg score: {telemetry.trend.average}</p>
      </footer>
    </section>
  );
};
