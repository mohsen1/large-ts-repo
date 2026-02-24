import { useMemo } from 'react';
import { TenantId, createTenantId, createSignalId } from '@domain/recovery-stress-lab';
import { useStreamTopology } from '../hooks/useStreamTopology';
import { useStreamDashboard } from '../hooks/useStreamDashboard';
import { useStressLabWorkspace } from '../hooks/useStressLabWorkspace';
import { StressLabWorkspaceBoard } from '../components/StressLabWorkspaceBoard';
import { StressLabCommandCenter } from '../components/StressLabCommandCenter';
import { StressLabReadinessCard } from '../components/StressLabReadinessCard';
import { StreamHealthCard } from '../components/StreamHealthCard';
import { StressLabRecommendationsPanel } from '../components/StressLabRecommendationsPanel';

export function StreamingStressLabPage() {
  const tenant: TenantId = createTenantId('tenant-main');
  const streamId = 'stream-core-analytics';
  const topology = useStreamTopology(streamId);
  const { state } = useStreamDashboard(`${tenant}`, streamId);
  const recoverySignals = state.snapshot.signals.map((signal, index) => ({
    id: createSignalId(`${tenant}-${streamId}-${signal.streamId}-${index}`),
    class: (index % 2 === 0 ? 'availability' : 'performance') as 'availability' | 'performance',
    severity: (signal.level === 'critical' ? 'critical' : signal.level === 'warning' ? 'medium' : 'low') as 'critical' | 'medium' | 'low',
    title: `${signal.streamId}-${index}`,
    createdAt: signal.observedAt,
    metadata: { source: 'stream', streamId: signal.streamId, details: signal.details },
  }));
  const workspaceHook = useStressLabWorkspace({
    tenantId: String(tenant),
    streamId,
    runbooks: topology.nodes.map((node, index) => ({
      id: node.id,
      title: `Runbook for ${node.id}`,
      steps: [
        {
          commandId: `${node.id}-${index}-step`,
          title: 'assess',
          phase: 'observe',
          estimatedMinutes: 10,
          prerequisites: [],
          requiredSignals: [],
        },
      ],
      cadence: { weekday: index, windowStartMinute: 90 + index * 10, windowEndMinute: 150 + index * 10 },
    })),
    signals: recoverySignals,
  });

  const planLabel = useMemo(() => (workspaceHook.workspace.plan ? 'plan available' : 'no plan'), [workspaceHook.workspace.plan]);

  return (
    <main>
      <h1>Streaming Stress Lab</h1>
      <p>{planLabel}</p>
      <StreamHealthCard streamId={streamId} signals={state.snapshot.signals} onAcknowledge={() => {}} />
      <StressLabWorkspaceBoard workspace={workspaceHook.workspace} onRequestRefresh={workspaceHook.refresh} />
      <StressLabCommandCenter workspace={workspaceHook.workspace} findings={workspaceHook.findings} />
      <StressLabReadinessCard workspace={workspaceHook.workspace} />
      <StressLabRecommendationsPanel lines={workspaceHook.findings} summary={workspaceHook.lastReport} />
      <button type="button" onClick={() => {
        void workspaceHook.bootstrap();
      }}>
        Run Stress Lab
      </button>
    </main>
  );
}
