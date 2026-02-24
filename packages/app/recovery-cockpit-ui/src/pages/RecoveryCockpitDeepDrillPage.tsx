import { InMemoryCockpitStore } from '@data/recovery-cockpit-store';
import { ScenarioRiskCard } from '../components/orchestration/ScenarioRiskCard';
import { useScenarioOrchestration } from '../hooks/useScenarioOrchestration';

type RecoveryCockpitDeepDrillPageProps = {
  readonly store: InMemoryCockpitStore;
};

export const RecoveryCockpitDeepDrillPage = ({ store }: RecoveryCockpitDeepDrillPageProps) => {
  const { plans, loading, togglePin } = useScenarioOrchestration(store);
  const flagged = plans.filter((plan) => !plan.isSafe).slice(0, 8);

  return (
    <main style={{ padding: 20 }}>
      <h2>Deep drill scenarios</h2>
      <p>{loading ? 'Loading...' : `Loaded ${flagged.length} high-severity scenarios`}</p>
      <section style={{ display: 'grid', gap: 10 }}>
        {flagged.map((plan) => (
          <ScenarioRiskCard key={plan.planId} plan={plan} selected={false} onToggle={() => togglePin(plan)} />
        ))}
      </section>
    </main>
  );
};
