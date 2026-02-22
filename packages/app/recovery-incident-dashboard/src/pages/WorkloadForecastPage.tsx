import { useState } from 'react';
import { WorkloadForecastBoard } from '../components/WorkloadForecastBoard';
import { DependencyRiskMatrix } from '../components/DependencyRiskMatrix';
import { useWorkloadForecast } from '../hooks/useWorkloadForecast';

export interface WorkloadForecastPageProps {
  readonly initialMode?: 'plan-only' | 'simulate' | 'drill';
}

export const WorkloadForecastPage = ({ initialMode = 'simulate' }: WorkloadForecastPageProps) => {
  const [mode, setMode] = useState<'plan-only' | 'simulate' | 'drill'>(initialMode);
  const [selectedBucket, setSelectedBucket] = useState('0');

  const {
    signal,
    plans,
    rows,
    loading,
    error,
    runPlan,
  } = useWorkloadForecast(mode);

  return (
    <main className="workload-forecast-page">
      <header>
        <h1>Recovery Workload Forecasting</h1>
        <p>Mode: {mode}</p>
        <label>
          Operating mode
          <select value={mode} onChange={(event) => setMode(event.target.value as 'plan-only' | 'simulate' | 'drill')}>
            <option value="plan-only">Plan only</option>
            <option value="simulate">Simulate</option>
            <option value="drill">Drill</option>
          </select>
        </label>
      </header>

      <section>
        <WorkloadForecastBoard
          rows={rows}
          plans={plans}
          onRun={async (incidentId) => {
            const status = await runPlan(incidentId);
            if (status) {
              window.alert(status);
              return status;
            }
            return undefined;
          }}
          isBusy={loading}
        />
      </section>

      <section>
        <DependencyRiskMatrix
          signal={signal}
          selectedBucket={selectedBucket}
          onBucketChange={setSelectedBucket}
        />
      </section>

      <section>
        {error ? <p className="error">Error: {error}</p> : null}
      </section>
    </main>
  );
};
