import { InMemoryCockpitStore } from '@data/recovery-cockpit-store';
import { ScenarioTopologyPanel } from '../components/orchestration/ScenarioTopologyPanel';
import { ScenarioRiskCard } from '../components/orchestration/ScenarioRiskCard';
import { ScenarioTimelinePanel } from '../components/orchestration/ScenarioTimelinePanel';
import { useScenarioOrchestration } from '../hooks/useScenarioOrchestration';

type RecoveryCockpitScenarioPlaybookPageProps = {
  readonly store: InMemoryCockpitStore;
};

export const RecoveryCockpitScenarioPlaybookPage = ({ store }: RecoveryCockpitScenarioPlaybookPageProps) => {
  const { loading, plans, pinned, readyPlans, errors, refresh, togglePin } = useScenarioOrchestration(store);

  const pinnedSet = new Set(pinned);

  return (
    <main style={{ padding: 20 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <h2>Scenario playbook orchestration</h2>
        <button type="button" onClick={refresh} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      <p>
        Ready plans: {readyPlans.length} / {plans.length}
      </p>

      {errors.length > 0 ? (
        <section style={{ border: '1px solid #fca5a5', padding: 12, borderRadius: 10, background: '#fef2f2' }}>
          <strong>Errors</strong>
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section style={{ marginTop: 12, display: 'grid', gap: 12 }}>
        <ScenarioTopologyPanel plans={plans} />
        <ScenarioTimelinePanel plans={plans} />
        <section style={{ display: 'grid', gap: 12 }}>
          {plans.map((plan) => (
            <ScenarioRiskCard key={plan.planId} plan={plan} selected={pinnedSet.has(plan.planId)} onToggle={() => togglePin(plan)} />
          ))}
        </section>
      </section>

      {plans.length === 0 ? <p>No scenarios available.</p> : null}
    </main>
  );
};
