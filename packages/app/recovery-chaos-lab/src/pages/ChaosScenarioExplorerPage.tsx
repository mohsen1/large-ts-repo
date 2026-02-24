import { useMemo, useState, useEffect } from 'react';
import { ChaosTopologyGraph } from '../components/ChaosTopologyGraph';
import { ChaosRunMatrix } from '../components/ChaosRunMatrix';
import { summarizeEvents } from '@service/recovery-chaos-orchestrator';
import { catalogDigest, loadBlueprint } from '../services/chaosRuntime';
import { useChaosTopology } from '../hooks/useChaosTopology';
import { asScenarioId, asNamespace, type ChaosScenarioDefinition } from '@domain/recovery-chaos-lab';
import type { ChaosRunEvent } from '@service/recovery-chaos-orchestrator';

export function ChaosScenarioExplorerPage() {
  const catalog = catalogDigest();
  const [selection, setSelection] = useState(catalog[0] ?? 'platform-chaos/9f6de4d6-9cb0-4a9c-95d2-ef12f7c5fbf8');
  const [runEvents, setRunEvents] = useState<readonly ChaosRunEvent[]>([]);

  const [namespace, scenarioId] = selection.split('/') as [string, string];
  const [scenario, setScenario] = useState<ChaosScenarioDefinition>({
    namespace: asNamespace(namespace ?? 'platform-chaos'),
    id: asScenarioId(scenarioId ?? '9f6de4d6-9cb0-4a9c-95d2-ef12f7c5fbf8'),
    title: 'loading',
    version: '0.0.0',
    stages: [],
    createdAt: 0 as never
  });

  useEffect(() => {
    let cancelled = false;
    void loadBlueprint(namespace ?? 'platform-chaos', scenarioId ?? '').then((resolved) => {
      if (!cancelled) {
        setScenario(resolved);
        setRunEvents([]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [namespace, scenarioId]);

  const topology = useChaosTopology(scenario);
  const summary = useMemo(() => summarizeEvents(runEvents), [runEvents]);

  return (
    <main className="chaos-scenario-page">
      <header>
        <h2>Scenario explorer</h2>
        <p>{catalog.length} seeded scenarios indexed</p>
      </header>
      <section>
        <label>
          Blueprint
          <select
            value={selection}
            onChange={(event) => {
              setSelection(event.target.value);
            }}
          >
            {catalog.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>
      </section>
      <section>
        <h3>Topology preview</h3>
        <ChaosTopologyGraph stages={topology.blueprint.stages} />
      </section>
      <section>
        <h3>Latest run summary</h3>
        <ul>
          <li>events {summary.attempts}</li>
          <li>failures {summary.failures}</li>
          <li>elapsed {summary.elapsedMs}ms</li>
        </ul>
      </section>
      <ChaosRunMatrix events={runEvents} />
      <section>
        <button
          type="button"
          onClick={() => {
            setRunEvents((current) => [
              ...current,
              {
                runId: scenario.id as never,
                at: Date.now() as never,
                kind: 'run-started'
              } as ChaosRunEvent
            ]);
          }}
        >
          Seed synthetic event
        </button>
      </section>
    </main>
  );
}
