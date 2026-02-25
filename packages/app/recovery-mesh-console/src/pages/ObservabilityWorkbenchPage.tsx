import { useCallback, useMemo, useState } from 'react';
import type { MeshSignalKind } from '@domain/recovery-ops-mesh';
import { useObservabilityEngine } from '../hooks/useObservabilityEngine';
import { ObservabilityPolicyConsole } from '../components/ObservabilityPolicyConsole';
import { ObservabilitySignalExplorer } from '../components/ObservabilitySignalExplorer';
import { isObservationRecord } from '@data/recovery-ops-mesh-observability-store';

const defaultTopology = {
  id: 'observability-workbench-topology',
  name: 'workbench',
  version: '1.0.0',
  nodes: [],
  links: [],
  createdAt: Date.now(),
};

export const ObservabilityWorkbenchPage = () => {
  const engine = useObservabilityEngine({
    topology: defaultTopology,
    signals: ['pulse', 'telemetry', 'snapshot', 'alert'],
  });
  const [activeKind, setActiveKind] = useState<MeshSignalKind>(
    'pulse',
  );
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>(undefined);

  const selectedRun = useMemo(() => {
    if (!selectedRunId) {
      return engine.runs.at(0);
    }
    return engine.runs.find((run) => run.id === selectedRunId);
  }, [engine.runs, selectedRunId]);

  const refreshAndRun = useCallback(async () => {
    await engine.run();
  }, [engine.run]);

  const runBatch = useCallback(async () => {
    await engine.run();
  }, [engine.run]);

  const runPreset = useCallback(async () => {
    await engine.runPreset(3);
  }, [engine.runPreset]);

  const metrics = useMemo(() => {
    const hasAlert = engine.lastRun?.events.some((entry) => isObservationRecord(entry) && entry.signal.kind === 'alert');
    const total = engine.eventCount;
    const signalCount = engine.lastRun?.items.length ?? 0;
    return {
      hasAlert,
      total,
      signalCount,
    };
  }, [engine.eventCount, engine.lastRun]);

  return (
    <main>
      <header>
        <h1>Observability Workbench</h1>
        <p>{`active=${engine.active} signals=${engine.signals.length} events=${metrics.total}`}</p>
      </header>

      <section>
        <button type="button" onClick={engine.refresh} disabled={engine.busy}>
          refresh
        </button>
        <button type="button" onClick={refreshAndRun} disabled={engine.busy}>
          run
        </button>
        <button type="button" onClick={runBatch} disabled={engine.busy}>
          run batch
        </button>
        <button type="button" onClick={runPreset} disabled={engine.busy}>
          run preset
        </button>
      </section>

      <section>
        <p>{`run history ${engine.runs.length} — alerts: ${metrics.hasAlert ? 'present' : 'none'}`}</p>
      </section>

      <ObservabilityPolicyConsole
        runs={engine.runs}
        onSelect={(run) => setSelectedRunId(run.id)}
      />

      <ObservabilitySignalExplorer
        topology={engine.topology}
        runs={engine.runs}
        activeKind={activeKind}
        selectedRun={selectedRun}
        onKindSelect={(kind) => {
          setActiveKind(kind);
        }}
      />

      <section>
        <h4>State</h4>
        <ul>
          <li>plan={engine.planId}</li>
          <li>runs={engine.runs.length}</li>
          <li>last signals={metrics.signalCount}</li>
          <li>active kind={activeKind}</li>
          <li>selected run={selectedRun?.id ?? 'none'}</li>
        </ul>
      </section>
    </main>
  );
};
