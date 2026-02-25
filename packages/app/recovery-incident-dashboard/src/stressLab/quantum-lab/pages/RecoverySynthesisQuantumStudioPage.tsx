import { useMemo } from 'react';
import { useQuantumSynthesisWorkspace } from '../hooks/useQuantumSynthesisWorkspace';
import { QuantumSynthesisControlPanel } from '../components/QuantumSynthesisControlPanel';
import { QuantumSynthesisTimelinePanel } from '../components/QuantumSynthesisTimelinePanel';
import { QuantumSynthesisTopologyPanel } from '../components/QuantumSynthesisTopologyPanel';

export const RecoverySynthesisQuantumStudioPage = () => {
  const { actions, ...state } = useQuantumSynthesisWorkspace();

  const timeline = useMemo(
    () =>
      state.envelope?.warnings?.map((item, index) => ({
        stage: `warning-${index}`,
        plugin: 'warning-plugin',
        latencyMs: item.length * 13,
      })) ?? [],
    [state.envelope?.warnings],
  );

  return (
    <main style={{ display: 'grid', gap: 16, padding: 16 }}>
      <header>
        <h1>Recovery Incident Quantum Synthesis Studio</h1>
        <p>Run synthetic orchestration flows with plugin telemetry and governance checkpoints.</p>
      </header>

      <QuantumSynthesisControlPanel
        runId={state.runId}
        loading={state.loading}
        mode={state.mode}
        onRun={actions.runScenario}
        onSimulate={actions.simulate}
        onApprove={actions.publish}
        onReset={actions.reset}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
        <QuantumSynthesisTopologyPanel
          blueprint={state.blueprint}
          selected={state.selectedCommandId}
          onSelect={actions.selectCommand}
        />
        <QuantumSynthesisTimelinePanel events={timeline} title="Orchestration Timeline" />
      </div>

      <section style={{ border: '1px dashed #999', borderRadius: 12, padding: 12 }}>
        <h3>Signals</h3>
        <ul>
          {state.blueprint.signals.map((signal) => (
            <li key={signal.signalId}>
              {signal.name} · {signal.severity} · {signal.score}
            </li>
          ))}
        </ul>
      </section>

      <section style={{ border: '1px dashed #999', borderRadius: 12, padding: 12 }}>
        <h3>Recent Workspace</h3>
        <p style={{ margin: 0 }}>plans: {state.workspaceState.planHistory.length}</p>
        <p style={{ margin: 0 }}>signals: {state.workspaceState.activeSignals.length}</p>
      </section>
    </main>
  );
};
