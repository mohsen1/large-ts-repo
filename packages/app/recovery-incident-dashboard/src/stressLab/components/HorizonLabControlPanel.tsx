import { useMemo } from 'react';
import type { HorizonWorkspaceFilters, HorizonWorkspace } from '../types';

const stageOptions = ['ingest', 'analyze', 'resolve', 'optimize', 'execute'] as const;

interface ControlProps {
  readonly workspace: HorizonWorkspace;
  readonly onChange: (filters: Partial<HorizonWorkspaceFilters>) => void;
}

export const HorizonLabControlPanel = ({ workspace, onChange }: ControlProps) => {
  const { state, actions } = workspace;
  const hasPlans = state.plans.length > 0;

  const selectedPlan = useMemo(() => {
    if (!state.selectedPlanId) {
      return 'none';
    }
    return state.plans.find((plan) => plan.id === state.selectedPlanId)?.id ?? 'none';
  }, [state.plans, state.selectedPlanId]);

  return (
    <section className="horizon-control-panel">
      <header>
        <h2>Horizon Control Panel</h2>
        <p>Current tenant: {state.lastQuery.tenantId}</p>
      </header>

      <div className="control-grid">
        <label>
          Tenant Id
          <input
            value={state.lastQuery.tenantId}
            onChange={(event) => {
              onChange({ tenantId: event.target.value || 'tenant-001' });
            }}
          />
        </label>

        <label>
          Include diagnostics
          <input
            type="checkbox"
            checked={state.lastQuery.includeDiagnostics}
            onChange={(event) => {
              onChange({ includeDiagnostics: event.target.checked });
            }}
          />
        </label>

        <fieldset>
          <legend>Stage filters</legend>
          {stageOptions.map((stage) => {
            const stages = state.lastQuery.stages;
            const isChecked = stages.includes(stage);
            return (
              <label key={stage}>
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(event) => {
                    if (event.target.checked) {
                      onChange({ stages: [...stages, stage] });
                    } else {
                      onChange({ stages: stages.filter((entry) => entry !== stage) });
                    }
                  }}
                />
                {stage}
              </label>
            );
          })}
        </fieldset>

        <div className="control-meta">
          <p>Plan count: {state.plans.length}</p>
          <p>Signal count: {state.signals.length}</p>
          <p>Current plan: {selectedPlan}</p>
          <p>Selected signal: {state.selectedSignalKind}</p>
          <p>Elapsed: {state.elapsedMs}ms</p>
        </div>
      </div>

      <footer>
        <button disabled={!hasPlans || !state.selectedPlanId} onClick={() => actions.run(state.plans[0])}>
          run selected
        </button>
        <button disabled={!state.selectedPlanId} onClick={() => actions.stop()}>
          stop
        </button>
        <button onClick={() => actions.refresh(state.lastQuery.tenantId)}>refresh</button>
      </footer>
    </section>
  );
};
