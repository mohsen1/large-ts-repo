import { useMemo, useState } from 'react';
import { useRecoveryQuantumOrchestration } from '../hooks/useRecoveryQuantumOrchestration';
import { QuantumOrchestrationControlPanel } from '../components/QuantumOrchestrationControlPanel';
import { QuantumWorkflowCanvas } from '../components/QuantumWorkflowCanvas';
import { QuantumPluginRegistryPanel } from '../components/QuantumPluginRegistryPanel';
import { defaultScenarioGraph, defaultScenarioNode, runQuantumScenario } from '../services/quantumScenarioEngine';
import type { QuantumWorkspace } from '../types';

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
  const orchestration = useRecoveryQuantumOrchestration({
    tenant,
    scenario: 'recovery-quantum',
    phases: ['collect', 'plan', 'execute', 'verify', 'close'],
  });
  const { workspace, telemetry, runState, timeline, result, runError, startRun, pluginMetrics } = orchestration;
  const [selectedNode, setSelectedNode] = useState<string>(workspace.workspaceId);

  const graph = useMemo(() => defaultScenarioGraph(workspace), [workspace]);
  const summaryNodes = useMemo(() => defaultScenarioNode(workspace), [workspace]);
  const baselineRoute = graph.toRouteMap();

  return (
    <main>
      <h1>Recovery Quantum Orchestration Studio</h1>
      <p>{`tenant=${tenant}`}</p>
      <p>{`phase=${runState}`}</p>
      <p>{`workspace=${workspace.workspaceId}`}</p>
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
        <p>{`active routes: ${Object.keys(baselineRoute).length}`}</p>
        <QuantumWorkflowCanvas
          graph={graph}
          selectedNodeId={selectedNode}
          onSelectNode={(nodeId) => {
            setSelectedNode(nodeId);
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
