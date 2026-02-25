import { useAdaptiveSimulation } from '../hooks/useAdaptiveSimulation';
import { SimulationControlBar } from '../components/adaptive/SimulationControlBar';
import { SimulationTopologyPanel } from '../components/adaptive/SimulationTopologyPanel';
import { SimulationMetricsPanel } from '../components/adaptive/SimulationMetricsPanel';
import { formatAdaptiveOutput } from '../services/adaptiveSimulationService';

const statusColor = (topology: string): string => {
  if (topology === 'mesh') {
    return '#dbeafe';
  }
  if (topology === 'ring') {
    return '#fef3c7';
  }
  return '#dcfce7';
};

export const RecoveryLabAdaptiveSimulationPage = (): React.JSX.Element => {
  const {
    mode,
    request,
    running,
    outputs,
    lastOutput,
    summary,
    runSingle,
    queue,
    setTenant,
    setWorkspace,
    setScenario,
    setTopology,
    setMode,
  } = useAdaptiveSimulation();

  return (
    <main style={{ padding: 16, display: 'grid', gap: 12 }}>
      <header>
        <h1>Adaptive Simulation Studio</h1>
        <p>{`mode=${mode} summary=${summary}`}</p>
      </header>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" disabled={running} onClick={() => setMode('single')}>
          single
        </button>
        <button type="button" disabled={running} onClick={() => setMode('batch')}>
          batch
        </button>
        <span style={{ alignSelf: 'center' }}>{`fingerprints=${outputs.length}`}</span>
      </div>

      <SimulationControlBar
        request={request}
        loading={running}
        onTenant={setTenant}
        onWorkspace={setWorkspace}
        onScenario={setScenario}
        onTopology={setTopology}
        onStart={runSingle}
        onQueue={queue}
      />

      <section style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <SimulationTopologyPanel outputs={outputs} />
        <SimulationMetricsPanel outputs={outputs} />
      </section>

      <section
        style={{
          border: `1px solid #cbd5e1`,
          borderRadius: 12,
          padding: 12,
          background: statusColor(request.topology),
        }}
      >
        <h3>Recent Outputs</h3>
        {lastOutput ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <p>{formatAdaptiveOutput(lastOutput)}</p>
            <p>{`health=${lastOutput.result.output.summary.health}`}</p>
            <p>{`risk=${lastOutput.result.output.summary.riskIndex.toFixed(3)}`}</p>
            <ul>
              {lastOutput.diagnostics.map((entry) => (
                <li key={`${lastOutput.seed}-${entry}`}>{entry}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p>No runs yet</p>
        )}
      </section>
    </main>
  );
};
