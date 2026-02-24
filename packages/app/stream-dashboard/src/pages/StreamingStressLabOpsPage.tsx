import { useMemo, useState } from 'react';
import { RecoverySignal, createSignalId, createTenantId } from '@domain/recovery-stress-lab';
import { TopologyNode } from '@domain/streaming-engine';
import { StreamStressLabWorkspace } from '../types/stressLab';
import { useStreamDashboard } from '../hooks/useStreamDashboard';
import { useStreamTopology } from '../hooks/useStreamTopology';
import { useStressLabWorkspace } from '../hooks/useStressLabWorkspace';
import { useStressLabAnalytics } from '../hooks/useStressLabAnalytics';
import { StressLabExecutionTimeline } from '../components/StressLabExecutionTimeline';
import { StressLabForecastPanel } from '../components/StressLabForecastPanel';
import { StressLabSignalHeatmap } from '../components/StressLabSignalHeatmap';
import { StreamHealthSignal } from '@domain/streaming-observability';

const mapTopologyToRunbooks = (nodes: readonly TopologyNode[]) => {
  return nodes.map((node, index) => ({
    id: node.id,
    title: `Runbook ${node.id} (${node.kind})`,
    steps: [
      {
        commandId: `${node.id}-step-1`,
        title: 'Assess',
        phase: 'observe' as const,
        estimatedMinutes: 8 + (index % 5),
        prerequisites: [],
        requiredSignals: [],
      },
      {
        commandId: `${node.id}-step-2`,
        title: 'Recover',
        phase: 'restore' as const,
        estimatedMinutes: 12 + (index % 3),
        prerequisites: [`${node.id}-step-1`],
        requiredSignals: [],
      },
    ],
    cadence: {
      weekday: index % 7,
      windowStartMinute: 80 + (index * 4),
      windowEndMinute: 120 + (index * 6),
    },
  }));
};

const mapStreamSignals = (tenantId: string, signals: readonly StreamHealthSignal[]): readonly RecoverySignal[] => {
  return signals.map((signal, index) => ({
    id: createSignalId(`${tenantId}-${index}-${signal.streamId}`),
    class: signal.level === 'critical' ? 'availability' : signal.level === 'warning' ? 'performance' : 'compliance',
    severity: signal.level === 'critical' ? 'critical' : signal.level === 'warning' ? 'medium' : 'low',
    title: `Stream ${signal.streamId} ${signal.level}`,
    createdAt: signal.observedAt,
    metadata: {
      streamId: signal.streamId,
      level: signal.level,
      source: 'stream-dashboard',
    },
  }));
};

export function StreamingStressLabOpsPage() {
  const tenant = createTenantId('tenant-main');
  const streamId = 'stream-core-analytics';
  const topologyState = useStreamTopology(streamId);
  const { state } = useStreamDashboard(`${tenant}`, streamId);
  const runbookInputs = useMemo(() => mapTopologyToRunbooks(topologyState.nodes), [topologyState.nodes]);
  const recoverySignals = useMemo(() => mapStreamSignals(String(tenant), state.snapshot.signals), [state.snapshot.signals, tenant]);
  const workspaceHook = useStressLabWorkspace({
    tenantId: String(tenant),
    streamId,
    runbooks: runbookInputs,
    signals: recoverySignals,
  });

  const analytics = useStressLabAnalytics(workspaceHook.workspace);
  const [activeTarget, setActiveTarget] = useState<string>('all');

  const filteredSignals = useMemo(() => {
    if (activeTarget === 'all') return workspaceHook.workspace.runbookSignals;
    return workspaceHook.workspace.runbookSignals.filter((signal) => signal.metadata['source'] === activeTarget);
  }, [activeTarget, workspaceHook.workspace.runbookSignals]);

  const selectedRunbooks = useMemo(() => {
    if (activeTarget === 'all') return workspaceHook.workspace.runbooks;
    return workspaceHook.workspace.runbooks.filter((runbook) => runbook.id === activeTarget || String(runbook.id).includes(activeTarget));
  }, [activeTarget, workspaceHook.workspace.runbooks]);

  return (
    <main>
      <header>
        <h1>Streaming Stress Lab Operations</h1>
        <p>Stream: {streamId}</p>
      </header>
      <section>
        <h3>Topology</h3>
        <p>Nodes: {topologyState.nodes.length}</p>
        <p>Edges: {topologyState.edges.length}</p>
      </section>
      <section>
        <h3>Signals</h3>
        <p>Total: {filteredSignals.length}</p>
        <label>
          Target filter
          <select value={activeTarget} onChange={(event) => setActiveTarget(event.target.value)}>
            <option value="all">all</option>
            {workspaceHook.workspace.targets.map((target) => (
              <option key={target.workloadId} value={target.workloadId}>
                {target.workloadId}
              </option>
            ))}
          </select>
        </label>
      </section>
      <button
        type="button"
        onClick={() => {
          void workspaceHook.bootstrap();
        }}
      >
        Rebuild Stress Lab
      </button>
      <StressLabSignalHeatmap workspace={workspaceHook.workspace} />
      <StressLabExecutionTimeline workspace={{ ...workspaceHook.workspace, runbooks: selectedRunbooks } as StreamStressLabWorkspace} />
      <StressLabForecastPanel analytics={analytics.analytics} />
      <section>
        <h3>Stream Health Snapshot</h3>
        <p>Tenant stream health signals: {state.snapshot.signals.length}</p>
        <p>Signals in metrics: {filteredSignals.length}</p>
      </section>
    </main>
  );
}
