import { Fragment } from 'react';

import { FusionMeshCommandQueue } from '../components/FusionMeshCommandQueue';
import { FusionMeshSignalBoard } from '../components/FusionMeshSignalBoard';
import { FusionMeshTopologyPanel } from '../components/FusionMeshTopologyPanel';
import { useRecoveryFusionMeshOrchestrator } from '../hooks/useRecoveryFusionMeshOrchestrator';

export const RecoveryFusionMeshOrchestratorPage = () => {
  const { state, runOrchestration, clear, topCriticalSignals } = useRecoveryFusionMeshOrchestrator();

  const phases = state.phases.map((phase) => <li key={phase}>{phase}</li>);
  const statusLine = state.error ? `Error: ${state.error}` : state.isRunning ? 'running...' : 'idle';

  return (
    <article className="fusion-mesh-page">
      <header>
        <h2>Recovery Fusion Mesh Orchestrator</h2>
        <p>{statusLine}</p>
        <p>Critical signal view: {topCriticalSignals ? 'active' : 'steady'}</p>
      </header>

      <section>
        <button type="button" onClick={runOrchestration}>
          Run once
        </button>
        <button type="button" onClick={clear}>
          Clear
        </button>
      </section>

      <section>
        <h3>Phases</h3>
        <ul>{phases}</ul>
      </section>

      <section>
        <FusionMeshTopologyPanel topology={state.run?.topology ?? null} />
      </section>

      <section>
        <h3>Signals</h3>
        <FusionMeshSignalBoard signals={state.output?.waves.flatMap((wave) => wave.commandIds.map((commandId) => ({
          id: commandId,
          phase: state.phases[state.phases.length - 1] ?? 'finish',
          source: (wave.nodes[0] ?? 'node-missing') as never,
          target: wave.nodes[1],
          class: 'baseline',
          severity: 2,
          payload: { commandId },
          createdAt: new Date().toISOString(),
        }))} />
      </section>

      <section>
        <FusionMeshCommandQueue output={state.output} />
      </section>

      <section>
        {state.output && (
          <pre>{JSON.stringify(state.output.summary, null, 2)}</pre>
        )}
      </section>
    </article>
  );
};
