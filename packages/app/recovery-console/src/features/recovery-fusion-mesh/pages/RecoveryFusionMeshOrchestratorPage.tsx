import { FusionMeshCommandQueue } from '../components/FusionMeshCommandQueue';
import { FusionMeshPolicyBadge } from '../components/FusionMeshPolicyBadge';
import { FusionMeshSignalInspector } from '../components/FusionMeshSignalInspector';
import { FusionMeshSignalBoard } from '../components/FusionMeshSignalBoard';
import { FusionMeshTopologyPanel } from '../components/FusionMeshTopologyPanel';
import { useRecoveryFusionMeshOrchestrator } from '../hooks/useRecoveryFusionMeshOrchestrator';

export const RecoveryFusionMeshOrchestratorPage = () => {
  const { state, runOrchestration, clear, topCriticalSignals } = useRecoveryFusionMeshOrchestrator();

  const phaseChips = state.phases.map((phase) => <li key={phase}>{phase}</li>);
  const statusLine = state.error ? `Error: ${state.error}` : state.isRunning ? 'running...' : 'ready';
  const commandCount = state.output?.commandIds.length ?? 0;
  const latestSignals = state.output ? state.output.waves.flatMap((wave) => wave.commandIds).slice(-6) : [];

  return (
    <article className="fusion-mesh-page">
      <header>
        <h2>Recovery Fusion Mesh Orchestrator</h2>
        <p>{statusLine}</p>
        <p>Critical signal view: {topCriticalSignals ? 'active' : 'steady'}</p>
        <FusionMeshPolicyBadge
          className="mesh-policy-badge"
          status={topCriticalSignals ? 'warning' : 'stable'}
          commandCount={commandCount}
          phaseCount={state.phases.length}
        />
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
        <ul>{phaseChips}</ul>
      </section>

      <section>
        <FusionMeshTopologyPanel topology={state.run?.topology ?? null} />
      </section>

      <section>
        <h3>Signals</h3>
        <FusionMeshSignalBoard signals={state.signals} />
      </section>

      <section>
        <FusionMeshSignalInspector signalIds={latestSignals} />
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
