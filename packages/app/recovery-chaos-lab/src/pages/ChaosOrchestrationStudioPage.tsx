import { useMemo } from 'react';
import { useChaosIntelligence } from '../hooks/useChaosIntelligence';
import { useChaosForecast } from '../hooks/useChaosForecast';
import { ChaosIntelligenceDashboard } from '../components/ChaosIntelligenceDashboard';
import { ChaosForecastTicker } from '../components/ChaosForecastTicker';
import { ChaosSessionTimeline } from '../components/ChaosSessionTimeline';

export interface ChaosOrchestrationStudioPageProps {
  readonly namespace: string;
  readonly scenarioId: string;
  readonly scenarioVersion?: string;
}

export function ChaosOrchestrationStudioPage({
  namespace,
  scenarioId,
  scenarioVersion = '1.0.0'
}: ChaosOrchestrationStudioPageProps) {
  const state = useChaosIntelligence({
    namespace,
    scenarioId,
    options: {
      dryRun: true
    }
  });

  const scenario = useMemo(() => {
    const scenario = state.session?.report.snapshot.scenarioId
      ? {
          namespace,
          id: scenarioId,
          stages: state.session?.report.snapshot.metrics ? Object.entries(state.session.report.snapshot.metrics).length : 0
        }
      : {
          namespace,
          id: scenarioId,
          stages: 0
        };
    return scenario;
  }, [namespace, scenarioId, state.session?.report.snapshot.metrics]);

  const forecast = useChaosForecast({
    namespace,
    scenarioId,
    scenarioVersion,
    stages: state.session?.report.snapshot.scenarioId
      ? state.session.report.snapshot.metrics
          ? (state.session.report.snapshot.metrics as unknown as never)
          : []
      : []
  });

  return (
    <main className="chaos-orchestration-studio">
      <header>
        <h2>Chaos orchestration studio</h2>
        <p>Scenario {namespace}/{scenarioId}</p>
      </header>
      <section>
        <ChaosIntelligenceDashboard
          report={state.session?.report ?? null}
          events={state.session?.events ?? []}
          eventRatioThreshold={0.6}
        />
      </section>
      <section>
        <ChaosForecastTicker title="Long-range signal" series={forecast.longRange} />
        <ChaosForecastTicker title="Short-range signal" series={forecast.shortRange} />
      </section>
      <section>
        <ChaosSessionTimeline events={state.session?.events ?? []} />
      </section>
      <footer>
        <small>runtime ready: {state.status}</small>
        <small>events: {state.events.length}</small>
        <small>latest progress: {state.latestProgress}%</small>
        <small>signals: {forecast.hasSignals ? 'active' : 'idle'}</small>
      </footer>
    </main>
  );
}
