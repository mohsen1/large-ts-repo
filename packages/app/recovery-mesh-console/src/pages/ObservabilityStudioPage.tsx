import { useCallback, useMemo, useState } from 'react';
import { ObservabilityPolicyTimeline } from '../components/ObservabilityPolicyTimeline';
import { ObservabilityStoreInspector } from '../components/ObservabilityStoreInspector';
import { useObservabilityWorkspace } from '../hooks/useObservabilityWorkspace';
import type { MeshSignalKind } from '@domain/recovery-ops-mesh';
import { isObservationRecord } from '@data/recovery-ops-mesh-observability-store';

const signalPalette: readonly MeshSignalKind[] = ['pulse', 'snapshot', 'telemetry', 'alert'];

export const ObservabilityStudioPage = () => {
  const workspace = useObservabilityWorkspace('observability-studio');
  const [selected, setSelected] = useState<MeshSignalKind>('pulse');
  const [seed, setSeed] = useState(2);

  const policySignals = useMemo(() => {
    return workspace.events.filter(isObservationRecord).map((event) => event.signal);
  }, [workspace.events]);

  const runNow = useCallback(async () => {
    await workspace.runForKind(selected, seed);
  }, [seed, selected, workspace.runForKind]);

  const runBatch = useCallback(async () => {
    await workspace.run();
  }, [workspace.run]);

  const baseline = useMemo(
    () => policySignals.map((signal) => signal.kind),
    [policySignals],
  );

  return (
    <main>
      <h1>Recovery Mesh Observability Studio</h1>
      <section>
        <label>
          Kind
          <select
            value={selected}
            onChange={(event) => setSelected(event.target.value as MeshSignalKind)}
          >
            {signalPalette.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </label>

        <label>
          Seed
          <input
            type="number"
            value={seed}
            onChange={(event) => {
              const next = Number(event.target.value);
              setSeed(Number.isFinite(next) ? next : 1);
            }}
          />
        </label>

        <button type="button" onClick={runNow} disabled={workspace.loading}>
          run
        </button>
        <button type="button" onClick={runBatch} disabled={workspace.loading}>
          run batch
        </button>
        <button type="button" onClick={() => workspace.reset()}>
          clear
        </button>
      </section>

      <ObservabilityStoreInspector
        topology={workspace.topology}
        events={workspace.events}
        onRefresh={() => workspace.reset()}
      />

      <ObservabilityPolicyTimeline
        policySignals={policySignals}
        baseline={baseline}
        onInspect={(signal, rank) => {
          setSelected(signal.kind);
          setSeed(rank + 1);
        }}
      />

      <h4>Report history</h4>
      <ul>
        {workspace.history.map((entry) => (
          <li key={entry}>{entry}</li>
        ))}
      </ul>
      <p>{`alerts: ${workspace.alerts.length}, loading: ${workspace.loading}`}</p>
      <ul>
        {workspace.alerts.map((alert) => (
          <li key={alert.id}>{alert.title}</li>
        ))}
      </ul>
    </main>
  );
}
