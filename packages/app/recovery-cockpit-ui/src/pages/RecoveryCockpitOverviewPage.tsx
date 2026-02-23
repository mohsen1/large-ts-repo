import { FC, useState } from 'react';
import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { useCockpitWorkspace } from '../hooks/useCockpitWorkspace';
import { CockpitSummaryPanel } from '../components/CockpitSummaryPanel';
import { ScenarioTimeline } from '../components/ScenarioTimeline';
import { ReadinessMatrix } from '../components/ReadinessMatrix';
import { PolicyRecommendations } from '../components/PolicyRecommendations';
import { useCockpitSimulation } from '../hooks/useCockpitSimulation';
import { PlanOpsConsole } from '../components/orchestration/PlanOpsConsole';
import { ForecastWorkspacePanel } from '../components/orchestration/ForecastWorkspacePanel';
import { SloGauge } from '../components/orchestration/SloGauge';

const EMPTY: ReadonlyArray<RecoveryPlan> = [];

export const RecoveryCockpitOverviewPage: FC = () => {
  const [mode, setMode] = useState<'optimistic' | 'balanced' | 'conservative'>('balanced');
  const [panelMode, setPanelMode] = useState<'forecast' | 'preview' | 'simulate'>('forecast');
  const workspace = useCockpitWorkspace({
    parallelism: 3,
    maxRuntimeMinutes: 240,
  });
  const simulation = useCockpitSimulation({ plans: workspace.plans });

  const selectedPlan = workspace.plans.find((candidate) => candidate.planId === workspace.selectedPlanId);

  return (
    <main style={{ fontFamily: 'Inter, system-ui, sans-serif', padding: 24, display: 'grid', gap: 16 }}>
      <header>
        <h1>Recovery Cockpit</h1>
        <p>Unified orchestration cockpit with readiness modeling and policy guidance.</p>
        <button onClick={() => void workspace.bootstrap()} type="button">Seed workspace</button>
        <button onClick={() => void workspace.refresh()} type="button" style={{ marginLeft: 8 }}>
          Refresh
        </button>
      </header>

      <section style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        {(workspace.plans.length ? workspace.plans : EMPTY).map((plan) => (
          <CockpitSummaryPanel
            key={plan.planId}
            plan={plan}
            onStartPlan={() => void workspace.startPlan(plan.planId)}
            actionCountLabel={(count) => `${count} orchestration actions`}
          />
        ))}
      </section>

      <section>
        <label htmlFor="plan">Active plan</label>
        <select
          id="plan"
          value={workspace.selectedPlanId}
          onChange={(event) => workspace.selectPlan(event.target.value)}
          disabled={!workspace.plans.length}
        >
          {workspace.plans.map((plan) => (
            <option key={plan.planId} value={plan.planId}>
              {plan.labels.short}
            </option>
          ))}
        </select>
      </section>

      <section style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        {selectedPlan ? <ScenarioTimeline plan={selectedPlan} /> : <p>No plan selected</p>}
        {selectedPlan ? <ReadinessMatrix plan={selectedPlan} selectedMode={mode} /> : <p>No readiness view</p>}
      </section>

      <section style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <SloGauge plans={workspace.plans} selectedPlanId={workspace.selectedPlanId} />
        <ForecastWorkspacePanel
          plan={selectedPlan}
          rows={simulation.summaries.map((entry) => ({
            planId: entry.planId,
            score: entry.score,
            heat: entry.heat,
          }))}
          onChangeMode={setPanelMode}
        />
      </section>

      <section>
        <h3>Simulation mode</h3>
        <p>{panelMode}</p>
        <ul>
          {simulation.simulations.map((entry) => (
            <li key={entry.planId}>
              {entry.planId}: estimated {entry.report.estimatedMinutes}m · {entry.actions.length} signals
            </li>
          ))}
        </ul>
      </section>

      <section>
        <PlanOpsConsole plans={workspace.plans} onPlanStarted={(planId) => void workspace.startPlan(planId)} />
      </section>

      <section>
        <h3>Forecast mode</h3>
        <button type="button" onClick={() => setMode('optimistic')}>Optimistic</button>
        <button type="button" onClick={() => setMode('balanced')} style={{ marginLeft: 8 }}>Balanced</button>
        <button type="button" onClick={() => setMode('conservative')} style={{ marginLeft: 8 }}>Conservative</button>
      </section>

      <PolicyRecommendations plan={selectedPlan} />

      <footer>
        <pre>{workspace.ready ? `Ready, ${workspace.plans.length} plans` : 'Not bootstrapped'}</pre>
      </footer>
    </main>
  );
};
