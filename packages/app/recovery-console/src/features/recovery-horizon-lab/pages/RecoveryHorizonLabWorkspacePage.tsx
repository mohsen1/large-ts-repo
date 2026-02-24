import { type ReactElement, useMemo, useState } from 'react';
import { HorizonLabTelemetryPanel } from '../components/HorizonLabTelemetryPanel';
import { HorizonLabWorkspaceDeck } from '../components/HorizonLabWorkspaceDeck';
import { useHorizonLabWorkspace } from '../hooks/useHorizonLabWorkspace';
import { type HorizonScenarioId, type HorizonWorkspaceId } from '@domain/recovery-stress-lab';

const sampleIdentity =
  'scenario-1|workspace-incident-horizon|session-001|trace-horizon-001|1709800000000';

export const RecoveryHorizonLabWorkspacePage = (): ReactElement => {
  const { state, actions } = useHorizonLabWorkspace({
    scenarioId: 'scenario-horizon-001' as HorizonScenarioId,
    workspaceId: 'workspace-incident-horizon' as HorizonWorkspaceId,
    identityKey: sampleIdentity,
  });

  const [compact, setCompact] = useState(false);
  const [focus, setFocus] = useState<'deck' | 'telemetry'>('deck');

  const labels = useMemo(
    () => ({
      deck: `Deck view (${state.summary?.timeline.length ?? 0} events)`,
      telemetry: `Telemetry (${state.summary?.state.route ?? 'stopped'})`,
    }),
    [state.summary?.timeline.length, state.summary?.state.route],
  );

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <header style={{ display: 'grid', gap: 8 }}>
        <h1>Recovery Horizon Lab Workspace</h1>
        <p>
          A synthetic stress-lab style orchestration surface. Controls exercise modern orchestration
          state transitions, plugin execution traces, and typed scenario payload streams.
        </p>
      </header>

      <section style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => setFocus('deck')}>
          {labels.deck}
        </button>
        <button type="button" onClick={() => setFocus('telemetry')}>
          {labels.telemetry}
        </button>
        <button type="button" onClick={() => setCompact((value) => !value)}>
          Layout: {compact ? 'compact' : 'expanded'}
        </button>
        <button type="button" onClick={actions.toggleAuto}>
          Auto mode
        </button>
      </section>

      <section
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: compact ? '1fr' : 'minmax(0, 2fr) minmax(260px, 1fr)',
          alignItems: 'start',
        }}
      >
        {focus === 'deck' && <HorizonLabWorkspaceDeck workspace={{ state, actions }} />}
        {focus === 'telemetry' && <HorizonLabTelemetryPanel summary={state.summary ?? null} />}
      </section>

      <section>
        <h2>Quick state summary</h2>
        <ul>
          <li>Workspace id: {state.id}</li>
          <li>Scenario: {state.scenarioId}</li>
          <li>Current stage: {state.stage}</li>
          <li>Timeline entries: {state.summary?.timeline.length ?? 0}</li>
          <li>Latest snapshot count: {state.summary?.snapshots.length ?? 0}</li>
          <li>Run id: {state.runId ?? 'inactive'}</li>
          <li>Running: {state.isRunning ? 'yes' : 'no'}</li>
          <li>History len: {state.stageHistory.length}</li>
        </ul>
      </section>
    </div>
  );
};

export default RecoveryHorizonLabWorkspacePage;
