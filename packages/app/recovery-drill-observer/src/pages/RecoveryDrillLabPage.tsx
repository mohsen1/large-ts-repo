import { useState } from 'react';
import { useDrillLabWorkspace } from '../hooks/useDrillLabWorkspace';
import { useDrillLabPolling } from '../hooks/useDrillLabPolling';
import { DrillLabCommandCard } from '../components/DrillLabCommandCard';
import { RunProgressTimeline } from '../components/RunProgressTimeline';
import { RunHealthMatrix } from '../components/RunHealthMatrix';
import { RunWorkspaceToolbar } from '../components/RunWorkspaceToolbar';
import { runDrillPlan, runDryPlan } from '../services/drillLabActions';
import { type DrillWorkspaceId, type DrillScenarioId } from '@domain/recovery-drill-lab';

export const RecoveryDrillLabPage = () => {
  const [workspaceId, setWorkspaceId] = useState<DrillWorkspaceId>('ws-main' as DrillWorkspaceId);
  const [scenarioId, setScenarioId] = useState<DrillScenarioId>('scenario-main' as DrillScenarioId);

  const { query, snapshots, mode, summaries, refresh, toggle } = useDrillLabWorkspace(workspaceId, scenarioId);
  const polling = useDrillLabPolling(workspaceId, scenarioId);

  return (
    <main>
      <header>
        <h1>Recovery Drill Lab</h1>
        <p>
          mode={mode} query={JSON.stringify(query)} snapshots={snapshots.length}
        </p>
      </header>

      <RunWorkspaceToolbar
        initialTenant="tenant-main"
        onSubmit={(payload) => {
          setWorkspaceId(payload.workspaceId as DrillWorkspaceId);
          setScenarioId(payload.scenarioId as DrillScenarioId);
          refresh();
        }}
      />

      <section style={{ marginBottom: 16 }}>
        <button type="button" onClick={() => toggle()}>
          Toggle local state
        </button>
        <button
          type="button"
          onClick={() => {
            void runDrillPlan({
              tenant: 'tenant-main',
              workspaceId,
              scenarioId,
            });
          }}
        >
          Run command
        </button>
        <button type="button" onClick={() => void runDryPlan()}>
          Run dry command
        </button>
        <button type="button" onClick={() => polling.start()}>
          Start polling
        </button>
        <button type="button" onClick={() => polling.stop()}>
          Stop polling
        </button>
        <p>
          polling={polling.isActive ? 'active' : 'idle'} ticks={polling.ticks} lastError={polling.lastError ?? 'none'}
        </p>
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        {snapshots.map((snapshot) => (
          <DrillLabCommandCard key={snapshot.id} snapshot={snapshot} onSelect={() => undefined} />
        ))}
      </section>

      {summaries.length > 0 ? <p>{summaries[0]}</p> : null}
      <RunProgressTimeline snapshots={snapshots} />
      <RunHealthMatrix snapshots={snapshots} />
    </main>
  );
};
