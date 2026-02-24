import { useMemo, useState, useEffect } from 'react';
import { useChaosTopology } from '../hooks/useChaosTopology';
import { ChaosControlPanel } from '../components/ChaosControlPanel';
import { ChaosTopologyGraph } from '../components/ChaosTopologyGraph';
import { ChaosRunMatrix } from '../components/ChaosRunMatrix';
import {
  asScenarioId,
  asNamespace,
  type ActionKind,
  type ChaosScenarioDefinition
} from '@domain/recovery-chaos-lab';
import { catalogDigest, loadBlueprint, type ChaosLabSessionConfig } from '../services/chaosRuntime';

interface SimulationFrame {
  readonly label: string;
  readonly value: number;
  readonly unit: string;
}

export function ChaosIncidentSimulationPage() {
  const catalog = catalogDigest();
  const scenarios = useMemo(() => catalog.map((entry) => entry.split('/')[1]), [catalog]);
  const fallback: ChaosScenarioDefinition = {
    namespace: asNamespace('platform-chaos'),
    id: asScenarioId('9f6de4d6-9cb0-4a9c-95d2-ef12f7c5fbf8'),
    title: 'Regional network partition',
    version: '1.0.0',
    stages: [],
    createdAt: 0 as never
  };

  const [active, setActive] = useState(scenarios[0] ?? '9f6de4d6-9cb0-4a9c-95d2-ef12f7c5fbf8');
  const [scenario, setScenario] = useState<ChaosScenarioDefinition>(fallback);

  useEffect(() => {
    let cancelled = false;
    void loadBlueprint('platform-chaos', active).then((loaded) => {
      if (!cancelled) {
        setScenario(loaded);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [active]);

  const topology = useChaosTopology(scenario);

  const controls = {
    selectedStage: undefined,
    dryRun: true,
    speedMs: 3,
    actions: ['latency', 'packet-loss', 'throttle', 'chaos-stop'] as const satisfies readonly ActionKind[]
  };

  const metrics = useMemo<readonly SimulationFrame[]>(() => {
    const map = new Map<string, number>([
      ['throughput', 112],
      ['churn', 22],
      ['variance', 8]
    ]);
    return [...map].map(([label, value]) => ({ label, value, unit: 'ms' }));
  }, []);

  const config: ChaosLabSessionConfig = {
    namespace: scenario.namespace,
    scenarioId: scenario.id,
    options: {
      dryRun: true
    }
  };

  return (
    <main className="chaos-simulation-page">
      <header>
        <h2>Incident simulation</h2>
        <p>{catalog.length} scenarios available</p>
      </header>
      <section>
        <label>
          Active scenario
          <select value={active} onChange={(event) => setActive(event.target.value)}>
            {scenarios.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>
      </section>
      <ChaosControlPanel controls={controls} status="idle" latest={null} onStart={() => {}} onStop={() => {}} onReset={() => {}} onAdjust={() => {}} />
      <section>
        <h3>Simulation metrics</h3>
        <ul>
          {metrics.map((metric) => (
            <li key={metric.label}>
              <strong>{metric.label}</strong>
              <span>
                {metric.value}
                {metric.unit}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <ChaosTopologyGraph stages={topology.blueprint.stages} />
      </section>
      <section>
        <ChaosRunMatrix events={[]} />
      </section>
      <pre className="chaos-session-config">{JSON.stringify(config, null, 2)}</pre>
    </main>
  );
}
