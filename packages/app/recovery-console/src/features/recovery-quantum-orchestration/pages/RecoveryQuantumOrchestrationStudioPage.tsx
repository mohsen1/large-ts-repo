import { useCallback, useMemo, useState } from 'react';
import { useRecoveryQuantumOrchestration } from '../hooks/useRecoveryQuantumOrchestration';
import { QuantumOrchestrationControlPanel } from '../components/QuantumOrchestrationControlPanel';
import { QuantumWorkflowCanvas } from '../components/QuantumWorkflowCanvas';
import { QuantumPluginRegistryPanel } from '../components/QuantumPluginRegistryPanel';
import { defaultScenarioGraph, defaultScenarioNode, runQuantumScenario } from '../services/quantumScenarioEngine';
import {
  type QuantumExecutionResult,
  type QuantumPluginMetric,
  type QuantumRunState,
  type QuantumTelemetryPoint,
  type QuantumTimelineEvent,
  type QuantumWorkspace,
  buildWorkloadTimeline,
  mapSeedToWorkspace,
} from '../types';
import type { QuantumTenantId } from '@domain/recovery-quantum-orchestration';

interface RecoveryQuantumOrchestrationStudioPageProps {
  readonly tenant: string;
}

const runScenarioQuickly = async (workspace: QuantumWorkspace) => {
  await runQuantumScenario({
    workspace,
    mode: 'live',
  });
};

export const RecoveryQuantumOrchestrationStudioPage = ({ tenant }: RecoveryQuantumOrchestrationStudioPageProps) => {
  const tenantId = `tenant:${tenant.startsWith('tenant:') ? tenant.slice(7) : tenant}` as QuantumTenantId;
  const orchestration = useRecoveryQuantumOrchestration(tenantId);
  const {
    refresh,
    refreshSignals,
    policies,
    runtimePlan,
    signals,
    queryStats,
    loadError,
    dashboard,
  } = orchestration;
  const [selectedNode, setSelectedNode] = useState<string>('studio-root');
  const [runState, setRunState] = useState<QuantumRunState>('idle');
  const [timeline, setTimeline] = useState<readonly QuantumTimelineEvent[]>([]);
  const [telemetry, setTelemetry] = useState<readonly QuantumTelemetryPoint[]>([]);
  const [pluginMetrics, setPluginMetrics] = useState<readonly QuantumPluginMetric[]>([]);
  const [result, setResult] = useState<QuantumExecutionResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [runIdPrefix, setRunIdPrefix] = useState<string>('studio');

  const workspace = useMemo(
    () =>
      mapSeedToWorkspace({
        tenant: tenantId.replace(/^tenant:/, ''),
        runId: runIdPrefix,
        scenario: 'recovery-quantum',
        mode: 'simulation',
        phases: ['collect', 'plan', 'execute', 'verify', 'close'],
      }),
    [tenantId, runIdPrefix],
  );

  const startRun = useCallback(async () => {
    setRunState('running');
    setRunError(null);
    try {
      const runOutput = await runQuantumScenario({ workspace, mode: 'live', seedTrace: `studio-${runIdPrefix}` });
      setPluginMetrics(runOutput.pluginMetrics);
      setTelemetry(runOutput.telemetry);
      setResult(runOutput.result);
      setTimeline(buildWorkloadTimeline(workspace, { offset: runOutput.pluginMetrics.length }));
      setRunState(runOutput.result.state);
      setRunIdPrefix((previous) => `${previous}-${runOutput.result.route.split(':').at(-1) ?? 'run'}`);
    } catch (error) {
      setRunState('errored');
      setRunError(error instanceof Error ? error.message : 'unknown scenario failure');
    }
  }, [runIdPrefix, workspace]);

  const filterLowSignals = useCallback(async () => {
    await refreshSignals('low');
  }, [refreshSignals]);

  const graph = useMemo(() => defaultScenarioGraph(workspace), [workspace]);
  const summaryNodes = useMemo(() => defaultScenarioNode(workspace), [workspace]);
  const baselineRoute = graph.toRouteMap();
  const scenarioSteps = useMemo(() => [...graph.topologicalOrder()], [graph]);

  const selectedWorkspace = workspace.workspaceId;

  return (
    <main>
      <h1>Recovery Quantum Orchestration Studio</h1>
      <p>{`tenant=${dashboard?.tenant ?? tenant}`}</p>
      <p>{`dashboard policy count=${dashboard?.policyCount ?? 0}`}</p>
      <p>{`phase=${runState}`}</p>
      <p>{`workspace=${selectedWorkspace}`}</p>
      <p>{`query total=${queryStats?.total ?? 0}`}</p>
      <p>{`query matched=${queryStats?.matched ?? 0}`}</p>
      <button type="button" onClick={() => void refresh()}>
        Refresh runbook
      </button>
      <button type="button" onClick={filterLowSignals}>
        Filter low signals
      </button>
      <QuantumOrchestrationControlPanel
        tenant={tenant}
        runState={runState}
        timeline={timeline}
        pluginMetrics={pluginMetrics}
        telemetry={telemetry}
        result={result}
        runError={runError}
        onRun={startRun}
      />
      <QuantumPluginRegistryPanel workspace={workspace} metrics={pluginMetrics} />
      <section>
        <h2>Runbook snapshot</h2>
        <p>Signals: {signals.length}</p>
        <p>Policies: {policies.length}</p>
        <p>Current plan: {runtimePlan?.id ?? 'none'}</p>
      </section>
      <button
        type="button"
        onClick={() => {
          void runScenarioQuickly(workspace);
        }}
        style={{ marginBottom: 12 }}
      >
        Dry run with defaults
      </button>
      <section>
        <h2>Graph</h2>
        <p>{`seed nodes: ${summaryNodes.length}`}</p>
        <p>{`route nodes: ${scenarioSteps.length}`}</p>
        <p>{`active routes: ${Object.keys(baselineRoute).length}`}</p>
        <p>{`loadError=${loadError ?? 'none'}`}</p>
        <QuantumWorkflowCanvas
          graph={graph}
          selectedNodeId={selectedNode}
          onSelectNode={(nodeId) => {
            void runQuantumScenario({
              workspace,
              mode: 'sim',
            }).then(() => {
              setSelectedNode(nodeId);
            });
          }}
        />
      </section>
      <section>
        <h2>Telemetry stream</h2>
        <ul>
          {telemetry.slice(-20).map((point) => (
            <li key={`${point.at}-${point.key}`}>
              {point.at} · {point.key} · {point.value.toFixed(2)} · {point.tags.join(',')}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
};
