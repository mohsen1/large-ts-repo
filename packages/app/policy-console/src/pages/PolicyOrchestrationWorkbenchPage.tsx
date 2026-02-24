import { useMemo } from 'react';
import { usePolicyConsoleWorkspace } from '../hooks/usePolicyConsoleWorkspace';
import { PolicyExecutionTimeline } from '../components/PolicyExecutionTimeline';
import { PolicyMetricCards } from '../components/PolicyMetricCards';
import { PolicyOrchestrationWorkspace } from '../components/PolicyOrchestrationWorkspace';
import { PolicyPluginRegistryPanel } from '../components/PolicyPluginRegistryPanel';
import { PolicyPluginLogTimeline } from '../components/PolicyPluginLogTimeline';
import { PolicyRunCards } from '../components/PolicyRunCards';

const fakeTimelines = [
  { label: 'plan-ready', startedAt: '2026-01-01T00:00:00.000Z', completed: true, score: 93.4 },
  { label: 'plan-dispatched', startedAt: '2026-01-01T00:01:00.000Z', completed: true, score: 90.8 },
  { label: 'validation', startedAt: '2026-01-01T00:02:00.000Z', completed: false, score: 61.3 },
];

const metrics = [
  { label: 'Artifacts', value: 3, unit: 'items' },
  { label: 'Success Rate', value: 84.3, unit: '%' },
  { label: 'Median Latency', value: 124, unit: 'ms' },
  { label: 'Retry Rate', value: 2.1, unit: '%' },
];

export function PolicyOrchestrationWorkbenchPage() {
  const { state, refresh, runDry, runLive, clearError, setQuery } = usePolicyConsoleWorkspace();
  const show = useMemo(() => ({
    total: state.artifacts.length,
    active: state.artifacts.filter((entry) => entry.state === 'active').length,
    nowRunning: state.runMode === 'full',
  }), [state.artifacts, state.runMode]);

  return (
    <main>
      <h1>Policy Orchestration Workbench</h1>
      <p>Showing {show.total} artifacts ({show.active} active).</p>
      <p>Now running: {show.nowRunning ? 'yes' : 'no'}</p>

      <PolicyOrchestrationWorkspace
        state={state}
        onRefresh={refresh}
        onRunDry={runDry}
        onRunLive={runLive}
        onSetQuery={setQuery}
        onClearError={clearError}
      />
      <PolicyRunCards orchestratorId={state.orchestratorId ?? 'orchestrator:policy-console'} />
      <PolicyPluginRegistryPanel namespace="telemetry" seed={state.lastPluginEnvelope} />
      <PolicyPluginLogTimeline envelope={state.lastPluginEnvelope} />

      <PolicyMetricCards metrics={metrics} />
      <PolicyExecutionTimeline points={fakeTimelines} />
    </main>
  );
}
