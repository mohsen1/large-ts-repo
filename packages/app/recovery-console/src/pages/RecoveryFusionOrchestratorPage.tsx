import { useState } from 'react';
import { useRecoveryFusionSignals } from '../hooks/useRecoveryFusionSignals';
import { useRecoveryFusionCoordinator } from '../hooks/useRecoveryFusionCoordinator';
import { FusionSignalInspector } from '../components/FusionSignalInspector';
import { FusionWaveDeck } from '../components/FusionWaveDeck';
import { FusionCommandConsole } from '../components/FusionCommandConsole';

export const RecoveryFusionOrchestratorPage = () => {
  const signalState = useRecoveryFusionSignals();
  const coordinator = useRecoveryFusionCoordinator();
  const [selectedWaveId, setSelectedWaveId] = useState<string | undefined>(undefined);

  return (
    <main className="recovery-fusion-orchestrator">
      <header>
        <h1>Fusion Orchestrator</h1>
        <p>
          Tenant {coordinator.tenant} · Run {coordinator.runId} · Plan {coordinator.planId}
        </p>
      </header>
      <section className="toolbar">
        <button type="button" onClick={() => coordinator.execute()}>
          Run plan cycle
        </button>
        <button type="button" onClick={signalState.clear}>
          Clear signals
        </button>
        <button type="button" onClick={coordinator.clear}>
          Reset coordinator
        </button>
      </section>
      <section className="status-grid">
        <div>
          <h2>Coordinator</h2>
          <p>Accepted: {coordinator.accepted ? 'yes' : 'no'}</p>
          <p>Busy: {coordinator.busy ? 'in-flight' : 'idle'}</p>
          <p>Commands: {coordinator.commands.length}</p>
          <p>Plan Result: {coordinator.planResult?.riskBand ?? 'n/a'}</p>
          <ol>
            {coordinator.commands.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ol>
        </div>
        <div>
          <h2>Signals</h2>
          <p>Window: {signalState.windowOverview ?? 'not initialized'}</p>
          <p>Signal clusters: {signalState.clusterCount}</p>
          <FusionSignalInspector
            tenant={signalState.tenant}
            signals={signalState.signals}
            summary={signalState.summary}
          />
        </div>
      </section>
      <FusionWaveDeck
        waves={coordinator.planResult?.waveCount ? [] : []}
        selectedWaveId={selectedWaveId}
        onSelectWave={setSelectedWaveId}
      />
      <FusionCommandConsole
        runId={coordinator.runId}
        tenant={coordinator.tenant}
        waves={[]}
        busy={coordinator.busy}
        onCommand={(command, waveId, reason) => {
          void coordinator.executeCommand({
            command: command as any,
            targetWaveId: waveId as any,
            runId: coordinator.runId as any,
            requestedAt: new Date().toISOString(),
            reason,
          });
        }}
      />
      <section>
        <button
          type="button"
          onClick={() =>
            signalState.loadSignal(signalState.tenant, [
              {
                id: `manual-${Date.now()}`,
                source: 'ui',
                severity: 7,
                confidence: 0.9,
                detectedAt: new Date().toISOString(),
                details: { source: 'ui' },
              },
            ])
          }
        >
          Ingest sample signal
        </button>
        <button type="button" onClick={() => void signalState.runRepositoryPing()}>
          Ping repository
        </button>
      </section>
      {coordinator.error ? <p className="error">Error: {coordinator.error}</p> : null}
      {signalState.error ? <p className="error">Signal error: {signalState.error}</p> : null}
    </main>
  );
};
