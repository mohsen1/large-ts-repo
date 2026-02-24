import { useMemo, useState } from 'react';
import { useLabGraphWorkspace } from '../hooks/useLabGraphWorkspace';
import { useLabGraphPlanner } from '../hooks/useLabGraphPlanner';
import { PlanRouteTimeline } from '../components/labGraph/PlanRouteTimeline';
import { ScenarioDeck } from '../components/labGraph/ScenarioDeck';
import { SignalIntensityPanel } from '../components/labGraph/SignalIntensityPanel';
import {
  makeNodeId,
  makeStepId,
  type GraphStep,
  type IntensityLevel,
  makeRunId,
  makeChannelId,
  type SignalEnvelope,
} from '@domain/recovery-lab-synthetic-orchestration';

const nodeSeed = ['source', 'transform', 'merge', 'sink'] as const;

interface GraphNode {
  id: string;
  type: 'source' | 'transform' | 'merge' | 'sink';
  route: string;
  tags: readonly string[];
}

const makeNodes = (): readonly GraphNode[] =>
  nodeSeed.map((type, index) => ({
    id: `${makeNodeId(`${type}-${index}`)}`,
    type,
    route: `${type}-${index}`,
    tags: [`${type}-tag`, `idx-${index}`],
  }));

const makeEdges = () => [
  { id: 'e1', from: 'source-0', to: 'transform-1', latencyMs: 12, weight: 0.5 },
  { id: 'e2', from: 'transform-1', to: 'merge-2', latencyMs: 8, weight: 0.8 },
  { id: 'e3', from: 'merge-2', to: 'sink-3', latencyMs: 5, weight: 0.9 },
];

const makeSteps = (tenant: string): readonly GraphStep<string>[] => [
  {
    id: makeStepId(`${tenant}-step-1`),
    name: 'ingest-core',
    phase: 'source',
    node: makeNodeId(`${tenant}-source-0`),
    intensity: 'calm',
    plugin: 'plugin-source' as any,
    estimatedMs: 20,
  },
  {
    id: makeStepId(`${tenant}-step-2`),
    name: 'transform-core',
    phase: 'transform',
    node: makeNodeId(`${tenant}-transform-1`),
    intensity: 'elevated',
    plugin: 'plugin-transform' as any,
    estimatedMs: 40,
  },
  {
    id: makeStepId(`${tenant}-step-3`),
    name: 'merge-core',
    phase: 'merge',
    node: makeNodeId(`${tenant}-merge-2`),
    intensity: 'extreme',
    plugin: 'plugin-merge' as any,
    estimatedMs: 80,
  },
  {
    id: makeStepId(`${tenant}-step-4`),
    name: 'emit-core',
    phase: 'sink',
    node: makeNodeId(`${tenant}-sink-3`),
    intensity: 'calm',
    plugin: 'plugin-sink' as any,
    estimatedMs: 11,
  },
];

export const RecoveryLabGraphOrchestrationPage = ({ tenant }: { readonly tenant: string }) => {
  const namespace = useMemo(() => `tenant/${tenant}/graph`, [tenant]);
  const [intensity, setIntensity] = useState<IntensityLevel>('elevated');
  const nodes = useMemo(() => makeNodes(), []);
  const edges = useMemo(() => makeEdges(), []);
  const steps = useMemo(() => makeSteps(tenant), [tenant]);

  const workspace = useLabGraphWorkspace({
    tenant,
    namespace,
    steps,
    nodes,
    edges,
    intensity,
  });

  const planner = useLabGraphPlanner({
    namespace,
    steps,
    filter: { intensity },
  });

  const label = `${tenant} · ${workspace.completed}/${workspace.total} completed`;

  const channelSeed = makeChannelId(`${tenant}::channel`);
  const envelope: SignalEnvelope<'graph'> = {
    id: makeRunId(`${tenant}-${workspace.runId}`),
    kind: 'graph',
    tenant,
    timestamp: Date.now(),
    payload: {
      namespace,
      channelSeed,
    },
  };

  return (
    <main style={{ padding: 16, display: 'grid', gap: 14 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Recovery Lab Graph Orchestration</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <select
            value={intensity}
            onChange={(event) => setIntensity(event.currentTarget.value as IntensityLevel)}
          >
            <option value="calm">calm</option>
            <option value="elevated">elevated</option>
            <option value="extreme">extreme</option>
          </select>
          <button type="button" onClick={() => void workspace.runPlan()} disabled={workspace.loading}>
            {workspace.loading ? 'running...' : 'rerun'}
          </button>
        </div>
      </header>

      <section>
        <p style={{ margin: 0 }}>
          {label}
        </p>
        <progress value={workspace.completion} max={100} />
      </section>

      {workspace.warning ? <p style={{ color: '#b91c1c' }}>{workspace.warning}</p> : null}
      {workspace.error ? <p style={{ color: '#b91c1c' }}>error: {workspace.error}</p> : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 }}>
        <ScenarioDeck namespace={namespace} steps={planner.all} />
        <PlanRouteTimeline
          steps={steps}
          selectedPhase={planner.criticalPath[0]}
          onSelect={(phase) => {
            void phase;
          }}
        />
      </div>

      <SignalIntensityPanel
        signals={workspace.selectedSignals.map((signal) => ({
          id: signal.step,
          plugin: signal.plugin,
          phase: signal.phase,
          value: signal.value,
        }))}
        onReplay={(id) => {
          void id;
        }}
      />

      <pre style={{ background: '#f7fafc', padding: 12, borderRadius: 6 }}>
        {JSON.stringify(
          {
            runId: workspace.runId,
            active: workspace.canRun,
            countsByIntensity: planner.countsByIntensity,
            signalCount: workspace.totalSteps,
            envelope,
          },
          null,
          2,
        )}
      </pre>
    </main>
  );
};
