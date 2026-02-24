import { useEffect, useMemo, useState } from 'react';
import { useChaosLabSession } from '../hooks/useChaosLabSession';
import { useChaosTopology } from '../hooks/useChaosTopology';
import { useChaosPluginRegistry, usePluginHealth } from '../hooks/useChaosRegistry';
import { ChaosControlPanel } from '../components/ChaosControlPanel';
import { ChaosRunMatrix } from '../components/ChaosRunMatrix';
import { ChaosTopologyGraph } from '../components/ChaosTopologyGraph';
import { ChaosPluginStatus } from '../components/ChaosPluginStatus';
import { catalogDigest, loadBlueprint, type ChaosLabSessionConfig } from '../services/chaosRuntime';
import { ok } from '@shared/result';
import {
  asNamespace,
  asScenarioId,
  toEpochMs,
  type ActionKind,
  type ChaosScenarioDefinition,
  type StageBoundary
} from '@domain/recovery-chaos-lab';

export function ChaosStudioPage() {
  const [namespace, setNamespace] = useState('platform-chaos');
  const [scenarioId, setScenarioId] = useState('9f6de4d6-9cb0-4a9c-95d2-ef12f7c5fbf8');
  const [scenario, setScenario] = useState<
    ChaosScenarioDefinition & { stages: readonly StageBoundary<string, unknown, unknown>[] } | null
  >(null);
  const [selected, setSelected] = useState<string | null>(null);

  const [controls, setControls] = useState({
    selectedStage: undefined as string | undefined,
    dryRun: false,
    speedMs: 2,
    actions: ['latency', 'packet-loss', 'throttle', 'chaos-stop'] as ActionKind[]
  });

  useEffect(() => {
    let cancelled = false;
    void loadBlueprint(namespace, scenarioId).then((next) => {
      if (!cancelled) {
        setScenario(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [namespace, scenarioId]);

  const fallbackScenario: ChaosScenarioDefinition & { stages: readonly StageBoundary<string, unknown, unknown>[] } = {
    namespace: asNamespace(namespace),
    id: asScenarioId(scenarioId),
    title: 'loading',
    version: '1.0.0',
    stages: [] as readonly StageBoundary<string, unknown, unknown>[],
    createdAt: toEpochMs(new Date(0))
  };

  const runtimeScenario = useMemo<ChaosScenarioDefinition & { stages: readonly StageBoundary<string, unknown, unknown>[] }>(
    () =>
      scenario ?? fallbackScenario,
    [scenario, namespace, scenarioId]
  );

  const factories = useMemo(() => {
    return runtimeScenario.stages.map((stage) => {
      return {
        stage: stage.name,
        execute: async (input: unknown) =>
          ok({
            signal: (input as { signal?: AbortSignal })?.signal,
            stage: stage.name
          })
      };
    });
  }, [runtimeScenario.stages]);

  const config: ChaosLabSessionConfig = {
    namespace: String(asNamespace(namespace)),
    scenarioId,
    options: {
      dryRun: controls.dryRun,
      preferredActions: controls.actions
    }
  };

  const { state, run, stop } = useChaosLabSession(config, factories as never);

  const topology = useChaosTopology(runtimeScenario);
  useChaosPluginRegistry<readonly StageBoundary<string, unknown, unknown>[]>(factories as never);

  const pluginRows = usePluginHealth(runtimeScenario.stages).map((row, index) => ({
    ...row,
    health: 75 + index * 5,
    status: index % 3 === 0 ? ('active' as const) : index % 3 === 1 ? ('idle' as const) : ('failed' as const),
    lastSeen: new Date().toISOString(),
    plugin: row.stage
  }));

  const latestEvents = state.events;

  return (
    <main className="chaos-studio-page">
      <header>
        <h2>Chaos Control Studio</h2>
        <p>Known catalog entries: {catalogDigest().length}</p>
      </header>
      <section>
        <label>
          Namespace
          <input value={namespace} onChange={(event) => setNamespace(event.target.value)} />
        </label>
        <label>
          Scenario
          <input value={scenarioId} onChange={(event) => setScenarioId(event.target.value)} />
        </label>
      </section>

      <ChaosControlPanel
        controls={controls}
        status={state.status === 'idle' ? 'idle' : state.status === 'running' ? 'running' : 'done'}
        latest={state.report}
        onStart={run}
        onStop={stop}
        onReset={() => {}}
        onAdjust={(next) => {
          setControls((current) => ({
            ...current,
            ...next,
            actions: [...next.actions]
          }));
        }}
      />

      <section>
        <h3>Topology</h3>
        <ChaosTopologyGraph
          stages={topology.blueprint.stages}
          selected={selected}
          onSelect={setSelected}
        />
      </section>

      <section>
        <ChaosRunMatrix events={latestEvents} />
      </section>

      <section className="plugin-overview">
        <ChaosPluginStatus pluginRows={pluginRows} events={latestEvents} onRefresh={() => {}} />
      </section>
    </main>
  );
}
