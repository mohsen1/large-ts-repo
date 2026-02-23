import { FC, useState } from 'react';
import { PlanId } from '@domain/recovery-cockpit-models';
import { useCockpitRunbook } from '../hooks/useCockpitRunbook';
import { RunbookPlanCard } from '../components/RunbookPlanCard';
import { PlanSignalInspector } from '../components/PlanSignalInspector';
import { InMemoryCockpitStore } from '@data/recovery-cockpit-store';
import { compareSimulationStrategies } from '@service/recovery-cockpit-orchestrator';

type ViewMode = 'overview' | 'signals' | 'simulator';

export const RecoveryCockpitIntelligencePage: FC = () => {
  const runbook = useCockpitRunbook();
  const [searchText, setSearchText] = useState('');
  const [mode, setMode] = useState<ViewMode>('overview');
  const [simResult, setSimResult] = useState<string>('');

  const selected = runbook.plans.find((plan) => plan.planId === runbook.selectedPlanId);

  const loadSearch = async () => {
    await runbook.searchPlans(searchText);
  };

  const runSimulation = async () => {
    if (!selected) {
      setSimResult('no plan selected');
      return;
    }

    const store = new InMemoryCockpitStore();
    for (const plan of runbook.plans) {
      await store.upsertPlan(plan);
    }

    const result = await compareSimulationStrategies(store, selected);
    const lines = [
      `winner=${result.winner}`,
      `reason=${result.rationale}`,
      `strategies=${result.strategies.length}`,
    ];
    setSimResult(lines.join(' | '));
  };

  const maybeReadiness = selected ? runbook.readiness.find((entry) => entry.planId === selected.planId) : undefined;

  return (
    <main style={{ padding: 18, display: 'grid', gap: 16, fontFamily: 'Georgia, serif' }}>
      <header style={{ display: 'grid', gap: 8 }}>
        <h1>Recovery Cockpit Intelligence</h1>
        <p>Plan intelligence, signal inspection, and strategy simulation.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search plans"
            type="text"
          />
          <button type="button" onClick={() => void loadSearch()}>
            Search
          </button>
          <button type="button" onClick={() => runbook.bootstrap()}>
            Refresh
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => setMode('overview')}>Overview</button>
          <button type="button" onClick={() => setMode('signals')}>Signals</button>
          <button type="button" onClick={() => setMode('simulator')}>Simulator</button>
        </div>
      </header>

        <section style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <label htmlFor="plan">Plan</label>
        <select id="plan" value={runbook.selectedPlanId ?? ''} onChange={(event) => runbook.selectPlan(event.target.value as PlanId)}>
          {runbook.plans.map((plan) => (
            <option key={plan.planId} value={plan.planId}>
              {plan.labels.short}
            </option>
          ))}
        </select>
      </section>

      {mode === 'overview' && (
        <section style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
          {runbook.plans.slice(0, 3).map((plan) => (
            <RunbookPlanCard
              key={plan.planId}
              plan={plan}
              strategy={runbook.strategy}
              onOpen={() => runbook.selectPlan(plan.planId)}
              onRunPreview={() => void runSimulation()}
            />
          ))}
          <article style={{ border: '1px solid #ddd', borderRadius: 10, padding: 12 }}>
            <h3>Readiness snapshot</h3>
            <p>Selected: {selected?.labels.short ?? 'none'}</p>
            {maybeReadiness ? (
              <>
                <p>Baseline score: {maybeReadiness.baselineScore}</p>
                <p>Windows: {maybeReadiness.windows.length}</p>
              </>
            ) : (
              <p>No readiness data</p>
            )}
          </article>
        </section>
      )}

      {mode === 'signals' && selected && (
        <section>
          <PlanSignalInspector
            planId={selected.planId}
            events={runbook.events}
            digest={{
              timestamp: new Date().toISOString() as any,
              activeCount: runbook.events.length,
              criticalCount: runbook.events.filter((event) => event.status === 'failed').length,
              mutedCount: runbook.events.filter((event) => event.status === 'queued').length,
              signals: runbook.events,
            }}
          />
        </section>
      )}

      {mode === 'simulator' && (
        <section style={{ border: '1px solid #ddd', borderRadius: 10, padding: 12, display: 'grid', gap: 8 }}>
          <h3>Simulation Studio</h3>
          <p>Run strategy simulations against current runbook set.</p>
          <button type="button" onClick={() => void runSimulation()}>
            Compare strategies
          </button>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{simResult || 'No result yet'}</pre>
          <label>Execution strategy</label>
          <select
            value={runbook.strategy}
            onChange={(event) => runbook.setStrategy(event.target.value as any)}
          >
            <option value="balanced">balanced</option>
            <option value="fastest-first">fastest-first</option>
            <option value="critical-first">critical-first</option>
            <option value="dependency-first">dependency-first</option>
          </select>
          <p>Change requests: {runbook.changeRequests.length}</p>
        </section>
      )}
    </main>
  );
};
