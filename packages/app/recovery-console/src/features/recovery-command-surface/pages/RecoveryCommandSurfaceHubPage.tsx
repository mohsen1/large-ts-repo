import { useMemo } from 'react';

import { RecoveryCommandSurfaceOverview } from '../components/RecoveryCommandSurfaceOverview';
import { RecoveryCommandSurfaceTimeline } from '../components/RecoveryCommandSurfaceTimeline';
import { RecoverySurfaceRiskPanel } from '../components/RecoverySurfaceRiskPanel';
import { useRecoveryCommandSurfaceWorkspace } from '../hooks/useRecoveryCommandSurfaceWorkspace';
import type { CommandSurfacePlanId } from '@domain/recovery-command-surface-models';

export const RecoveryCommandSurfaceHubPage = ({ tenant = 'default' }: { readonly tenant?: string }) => {
  const state = useRecoveryCommandSurfaceWorkspace(tenant);
  const isBusy = state.loading || state.workspace.running;
  const canStart = Boolean(state.workspace.selectedPlanId);

  const selectedPlan = useMemo(
    () => state.workspace.plans.find((plan) => plan.id === state.workspace.selectedPlanId) ?? null,
    [state.workspace.plans, state.workspace.selectedPlanId],
  );

  const selectedRun = useMemo(
    () => state.workspace.runs.find((run) => run.id === state.workspace.selectedRunId) ?? null,
    [state.workspace.runs, state.workspace.selectedRunId],
  );

  return (
    <main>
      <h1>Recovery Command Surface</h1>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' }}>
        <button type="button" disabled={!canStart || isBusy} onClick={() => {
          if (state.workspace.selectedPlanId) {
            void state.startRun(state.workspace.selectedPlanId as CommandSurfacePlanId);
          }
        }}>
          Start Surface Run
        </button>
        <button type="button" onClick={() => void state.refresh()} disabled={isBusy}>
          Refresh
        </button>
        <button type="button" onClick={() => state.clearSelection()}>
          Clear Selection
        </button>
      </div>
      {state.loading && <p>Loading surface workspace…</p>}
      {state.errors.length > 0 && (
        <ul>
          {state.errors.map((error) => <li key={error}>⚠ {error}</li>)}
        </ul>
      )}
      <RecoveryCommandSurfaceOverview workspace={state.workspace} />
      <RecoveryCommandSurfaceTimeline runs={state.workspace.runs} />
      <RecoverySurfaceRiskPanel runs={state.workspace.runs} />
      <section>
        <h3>Plan Detail</h3>
        <p>selectedPlan: {selectedPlan?.name ?? 'none'}</p>
        <p>selectedRun: {selectedRun?.id ?? 'none'}</p>
      </section>
      <section>
        <h3>Projection</h3>
        {state.projection ? (
          <pre>{JSON.stringify(state.projection, null, 2)}</pre>
        ) : (
          <p>No active projection.</p>
        )}
      </section>
      <p>Total external signals captured: {state.signalCount}</p>
    </main>
  );
};
