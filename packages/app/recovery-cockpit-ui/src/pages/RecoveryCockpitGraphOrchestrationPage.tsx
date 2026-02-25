import { type FC, useMemo, useState } from 'react';
import { GraphControlToolbar } from '../components/orchestration/GraphControlToolbar';
import { GraphOrchestrationBoard } from '../components/orchestration/GraphOrchestrationBoard';
import { GraphReplayConsole } from '../components/orchestration/GraphReplayConsole';
import { WorkspaceIntentCard } from '../components/orchestration/WorkspaceIntentCard';
import { useCockpitGraphOrchestrator } from '../hooks/useCockpitGraphOrchestrator';

const intentGroups = ['continuity', 'policy', 'resilience'];

export const RecoveryCockpitGraphOrchestrationPage: FC = () => {
  const [mode, setMode] = useState<'graph' | 'timeline' | 'diagnostics'>('graph');
  const [intent, setIntent] = useState('continuity');
  const { start, isRunning, workspaceState } = useCockpitGraphOrchestrator({
    tenant: 'tenant-01',
    scenario: 'cockpit-graph',
    mode: 'live',
  });

  const headline = useMemo(() => `Selected intent: ${intent}`, [intent]);

  return (
    <main style={{ padding: 24, display: 'grid', gap: 20 }}>
      <header>
        <h1>Recovery Cockpit Graph Orchestration</h1>
        <p>Typed registry-driven orchestrator with deterministic path replay and timeline telemetry.</p>
      </header>

      <GraphControlToolbar
        selectedMode={mode}
        onModeChange={setMode}
        canRun={!isRunning}
        onRun={start}
        onReset={() => {
          setIntent('continuity');
        }}
      />

      <section
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        }}
      >
        {intentGroups.map((entry) => (
          <WorkspaceIntentCard
            key={entry}
            intentName={entry}
            labels={[entry, 'signal', 'control']}
            confidence={entry === intent ? 0.9 : 0.62}
            selected={entry === intent}
            onSelect={() => setIntent(entry)}
          />
        ))}
      </section>

      <h2>{headline}</h2>

      <GraphOrchestrationBoard
        events={workspaceState.events}
        topologyNodes={workspaceState.topologyNodes}
        onDrill={(nodeId) => {
          console.info('drill', nodeId);
        }}
      />

      <GraphReplayConsole title="Execution stream" events={workspaceState.events} />

      <section>
        <h2>Workspace state</h2>
        <p>Status: {workspaceState.status}</p>
        <pre>{JSON.stringify(workspaceState.metrics, null, 2)}</pre>
      </section>
    </main>
  );
};
