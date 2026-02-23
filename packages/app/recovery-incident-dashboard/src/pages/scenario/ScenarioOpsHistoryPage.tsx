import type { UseScenarioOrchestratorInput } from '../../types/scenario-dashboard/incidentScenarioWorkspace';
import { useScenarioDataStream } from '../../hooks/scenario/useScenarioDataStream';
import { useScenarioPlanEngine } from '../../hooks/scenario/useScenarioPlanEngine';
import { ScenarioActivityFeed } from '../../components/scenario/ScenarioActivityFeed';

export const ScenarioOpsHistoryPage = ({ tenantId, scenarioId }: UseScenarioOrchestratorInput) => {
  const stream = useScenarioDataStream({ tenantId, scenarioId });
  const planEngine = useScenarioPlanEngine({ tenantId, scenarioId, incidentId: `${scenarioId}-history` });
  const latestSignal = stream.samples[0];

  const metrics = stream.latestByMetric
    .map((entry) => ({
      metric: entry.metric,
      count: entry.points.length,
      latest: entry.points.at(-1)?.value ?? 0,
    }))
    .sort((left, right) => right.count - left.count);

  return (
    <main>
      <header>
        <h1>Scenario History</h1>
        <p>{tenantId}/{scenarioId}</p>
        <p>Latest metric: {latestSignal ? `${latestSignal.metric}: ${latestSignal.value}` : 'n/a'}</p>
        <button onClick={() => stream.pause()}>Pause</button>
        <button onClick={() => stream.resume()}>Resume</button>
      </header>
      <section>
        <h2>Signals</h2>
        <ul>
          {metrics.map((metric) => (
            <li key={metric.metric}>
              <strong>{metric.metric}</strong> {metric.count} samples, latest {metric.latest}
            </li>
          ))}
        </ul>
      </section>
      <ScenarioActivityFeed
        events={planEngine.events}
        onSelectEvent={(id) => {
          return;
        }}
      />
    </main>
  );
};
