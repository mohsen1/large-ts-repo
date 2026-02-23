import { FC, useMemo, useState } from 'react';
import { useCockpitWorkspace } from '../hooks/useCockpitWorkspace';
import { useCockpitReadinessSignals } from '../hooks/useCockpitReadinessSignals';
import { useCockpitWorkloadPlanner } from '../hooks/useCockpitWorkloadPlanner';
import { CockpitOperationsBoard } from '../components/CockpitOperationsBoard';
import { ReadinessSignalPanel } from '../components/ReadinessSignalPanel';
import { ForecastWorkspace } from '../components/ForecastWorkspace';

export const RecoveryCockpitOpsWorkspacePage: FC = () => {
  const [mode, setMode] = useState<'preview' | 'live'>('preview');
  const workspace = useCockpitWorkspace({ parallelism: 4, maxRuntimeMinutes: 180, policyMode: 'advisory' });
  const planner = useCockpitWorkloadPlanner(workspace.plans);
  const readiness = useCockpitReadinessSignals(workspace.plans);

  const selectedPlan = useMemo(
    () => workspace.plans.find((plan) => plan.planId === planner.selected),
    [planner.selected, workspace.plans],
  );

  return (
    <main style={{ fontFamily: 'Inter, sans-serif', padding: 20, display: 'grid', gap: 16 }}>
      <header>
        <h1>Recovery Cockpit Operations Workspace</h1>
        <p>Extended orchestration workspace with scheduler and readiness signal analysis.</p>
        <button type="button" onClick={() => void workspace.bootstrap()}>Bootstrap workspace</button>
        <button type="button" onClick={() => void workspace.refresh()} style={{ marginLeft: 8 }}>Refresh</button>
        <button type="button" onClick={() => void readiness.refresh()} style={{ marginLeft: 8 }}>Refresh signals</button>
      </header>

      <section style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button type="button" onClick={() => setMode('preview')}>Preview</button>
        <button type="button" onClick={() => setMode('live')} style={{ marginLeft: 8 }}>Live view</button>
      </section>

      <section style={{ display: 'grid', gap: 16, gridTemplateColumns: '1fr 1fr' }}>
        <CockpitOperationsBoard
          plans={workspace.plans}
          summaries={planner.top}
          active={planner.active}
          onTogglePlan={planner.toggleAction}
        />
        <ReadinessSignalPanel snapshots={readiness.snapshots} />
      </section>

      {mode === 'preview' ? (
        <ForecastWorkspace
          activeSummary={planner.activeSummary}
          onRunPreview={() => {
            if (selectedPlan) {
              void workspace.startPlan(selectedPlan.planId);
            }
          }}
        />
      ) : (
        <div style={{ border: '1px dashed #ddd', borderRadius: 8, padding: 12 }}>
          <h2>Live orchestration lane</h2>
          <pre>{workspace.ready ? `${workspace.plans.length} plans loaded` : 'No plan loaded'}</pre>
          <p>Mode: {mode}</p>
          <p>Selected: {selectedPlan?.labels.short ?? 'none'}</p>
        </div>
      )}
    </main>
  );
};
