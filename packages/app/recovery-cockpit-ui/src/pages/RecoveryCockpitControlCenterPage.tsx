import { FC, useState } from 'react';
import { useCockpitWorkspace } from '../hooks/useCockpitWorkspace';
import { PolicyDecisionPanel } from '../components/PolicyDecisionPanel';
import { ForecastSummaryCard } from '../components/ForecastSummaryCard';
import { RunMonitorPanel } from '../components/RunMonitorPanel';
import { ReadinessForecastGrid } from '../components/ops/ReadinessForecastGrid';
import { PolicyCoverageCard } from '../components/forecast/PolicyCoverageCard';
import { InMemoryCockpitInsightsStore } from '@data/recovery-cockpit-insights';
import { createCockpitInsightsFacade } from '@data/recovery-cockpit-insights';

export const RecoveryCockpitControlCenterPage: FC = () => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const workspace = useCockpitWorkspace({ parallelism: 3, maxRuntimeMinutes: 240, retryPolicy: { enabled: true, maxRetries: 3 }, policyMode: 'advisory' });
  const selectedPlan = workspace.plans.find((candidate) => candidate.planId === workspace.selectedPlanId);
  const store = new InMemoryCockpitInsightsStore();
  const facade = createCockpitInsightsFacade(store);

  const bootstrap = async () => {
    await workspace.bootstrap();
    for (const plan of workspace.plans) {
      await facade.seed(plan);
    }
  };

  return (
    <main style={{ fontFamily: 'Arial, sans-serif', padding: 24, display: 'grid', gap: 16 }}>
      <header>
        <h1>Recovery Cockpit Control Center</h1>
        <p>Policy-aware control and readiness modeling workspace.</p>
        <button type="button" onClick={() => void bootstrap()}>Initialize signals</button>
        <button type="button" onClick={() => setShowAdvanced((value) => !value)} style={{ marginLeft: 8 }}>
          {showAdvanced ? 'Hide' : 'Show'} advanced
        </button>
      </header>

      <section>
        <PolicyDecisionPanel plans={workspace.plans} />
      </section>

      <section>
        <select
          value={workspace.selectedPlanId}
          onChange={(event) => workspace.selectPlan(event.target.value)}
          disabled={!workspace.plans.length}
        >
          {workspace.plans.map((plan) => (
            <option value={plan.planId} key={plan.planId}>
              {plan.labels.short}
            </option>
          ))}
        </select>
      </section>

      {selectedPlan ? <ForecastSummaryCard plan={selectedPlan} /> : <p>No plan</p>}
      {selectedPlan ? <RunMonitorPanel plan={selectedPlan} /> : <p>No monitor</p>}
      {selectedPlan ? <ReadinessForecastGrid plan={selectedPlan} /> : <p>No readiness</p>}

      {showAdvanced && selectedPlan ? (
        <PolicyCoverageCard plan={selectedPlan} insights={store} />
      ) : null}

      <footer>
        <pre>{workspace.ready ? `Ready, ${workspace.plans.length} plans` : 'Not ready'}</pre>
      </footer>
    </main>
  );
};
