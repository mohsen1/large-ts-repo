import { FC, useMemo } from 'react';
import { useStressLabOrchestrator } from '../hooks/useStressLabOrchestrator';
import { StressLabControlPanel } from '../components/stresslab/StressLabControlPanel';
import { StressLabTopologyMap } from '../components/stresslab/StressLabTopologyMap';
import { StressLabRunCard } from '../components/stresslab/StressLabRunCard';

const AVAILABLE_SIGNAL_OPTIONS = [
  { id: 'signal:latency-spike', title: 'Latency spike' },
  { id: 'signal:disk-saturation', title: 'Disk saturation' },
  { id: 'signal:queue-backlog', title: 'Queue backlog' },
];

const AVAILABLE_RUNBOOK_OPTIONS = [
  { id: 'runbook:orchestrate-cache', title: 'Orchestrate cache failover' },
  { id: 'runbook:drain-fallback', title: 'Drain traffic to fallback' },
  { id: 'runbook:rollback', title: 'Rollback risky deployment' },
];

const sampleTopologyNodes = [
  { id: 'edge-a', label: 'Edge API', team: 'platform', active: true },
  { id: 'cache-a', label: 'Cache', team: 'platform', active: true },
  { id: 'db-a', label: 'Primary DB', team: 'platform', active: false },
];

const sampleTopologyEdges = [
  { from: 'edge-a', to: 'cache-a', coupling: 0.65 },
  { from: 'cache-a', to: 'db-a', coupling: 0.92 },
];

const mappedTopology = {
  tenantId: 'tenant:recovery:stress',
  nodes: sampleTopologyNodes,
  edges: sampleTopologyEdges,
};

const toTrace = (traces: readonly string[]) =>
  traces.map((entry, index) => ({
    pluginId: `trace-${index}`,
    at: new Date().toISOString(),
    message: entry,
    stage: index,
    status: 'trace' as const,
  }));

const initialSeed = {
  tenantId: mappedTopology.tenantId,
  topology: mappedTopology,
  selectedRunbookIds: ['runbook:orchestrate-cache'],
  selectedSignalIds: ['signal:latency-spike'],
  mode: 'plan' as const,
};

export const RecoveryCockpitStressLabOrchestrationPage: FC = () => {
  const {
    status,
    phase,
    tenantId,
    selectedMode,
    selectedRunbookIds,
    selectedSignalIds,
    runId,
    traces,
    traceHash,
    errors,
    start,
    setMode,
    appendRunbook,
    appendSignal,
    clearErrors,
  } = useStressLabOrchestrator(initialSeed);

  const traceCards = useMemo(() => toTrace(traces), [traces]);

  return (
    <main style={{ display: 'grid', gap: 16, padding: 16 }}>
      <h1>Recovery Stress Lab Orchestration</h1>
      <p style={{ margin: 0 }}>Advanced orchestration control plane prototype for stress scenario planning.</p>

      <StressLabControlPanel
        tenantId={tenantId}
        mode={selectedMode}
        selectedRunbooks={selectedRunbookIds}
        selectedSignals={selectedSignalIds}
        availableRunbooks={AVAILABLE_RUNBOOK_OPTIONS}
        availableSignals={AVAILABLE_SIGNAL_OPTIONS}
        onChangeMode={setMode}
        onToggleRunbook={appendRunbook}
        onToggleSignal={appendSignal}
        onRun={start}
      />

      <section style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
        <StressLabRunCard
          runId={runId}
          tenantId={tenantId}
          phase={phase}
          status={status}
          traces={traceCards}
          onRefresh={start}
        />
        <section style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12 }}>
          <h3>Run metadata</h3>
          <ul>
            <li>mode: {selectedMode}</li>
            <li>trace hash: {traceHash}</li>
            <li>errors: {errors.length}</li>
          </ul>
          {errors.length > 0 ? <button onClick={clearErrors} type="button">clear errors</button> : null}
        </section>
      </section>

      <StressLabTopologyMap nodes={mappedTopology.nodes} edges={mappedTopology.edges} />

      <section style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12 }}>
        <h3>Diagnostics</h3>
        <pre style={{ whiteSpace: 'pre-wrap' }}>
          {JSON.stringify(
            {
              status,
              phase,
              runId,
              selectedMode,
              selectedRunbookIds,
              selectedSignalIds,
            },
            null,
            2,
          )}
        </pre>
      </section>
    </main>
  );
};
