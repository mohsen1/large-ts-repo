import { useState } from 'react';
import { PlanId } from '@domain/recovery-cockpit-models';
import { useBlueprintOrchestrator } from '../hooks/useBlueprintOrchestrator';
import { BlueprintControlPanel } from '../components/orchestration/BlueprintControlPanel';
import { BlueprintTimeline } from '../components/orchestration/BlueprintTimeline';

type LogEntry = {
  readonly text: string;
  readonly at: string;
};

const pushLog = (entries: readonly LogEntry[], text: string): readonly LogEntry[] => [
  ...entries.slice(-19),
  { text, at: new Date().toISOString() },
];

export const RecoveryCockpitBlueprintOrchestrationPage = () => {
  const {
    plans,
    blueprints,
    selectedPlanId,
    selectedBlueprintId,
    catalogSnapshot,
    blueprintTrace,
    statusText,
    running,
    executing,
    lastRun,
    seedCatalog,
    hydrate,
    runPlan,
    refreshSnapshot,
    selectPlan,
    selectBlueprint,
    queueRun,
  } = useBlueprintOrchestrator('recovery-cockpit-blueprints');

  const [selectedStepId, setSelectedStepId] = useState('');
  const [log, setLog] = useState<readonly LogEntry[]>([]);
  const activeBlueprint = blueprints.find((item) => item.blueprintId === selectedBlueprintId) ?? null;
  const selectedPlan = plans.find((item) => item.planId === selectedPlanId) ?? plans[0];

  const handleSeed = async () => {
    await seedCatalog(6);
    setLog((value) => pushLog(value, 'Seeded blueprint catalog with 6 plans'));
  };

  const handleRefresh = async () => {
    await hydrate();
    setLog((value) => pushLog(value, 'Hydrated catalog and snapshots'));
  };

  const handleRun = async (planId: PlanId, mode: 'analysis' | 'simulate' | 'execute' | 'verify') => {
    await runPlan(planId, mode);
    await refreshSnapshot();
    setLog((value) => pushLog(value, `Executed plan ${planId} in ${mode}`));
  };

  const handleQueue = async (mode: 'analysis' | 'simulate' | 'execute' | 'verify') => {
    if (!activeBlueprint) {
      setLog((value) => pushLog(value, `Queue blocked: no active blueprint`));
      return;
    }
    await queueRun(activeBlueprint, mode);
    await refreshSnapshot();
    setLog((value) => pushLog(value, `Queued blueprint ${activeBlueprint.blueprintId} for ${mode}`));
  };

  const allLogs = [statusText, ...blueprintTrace].map((entry) => entry.split('\n')[0]).slice(0, 20);
  const latestRun = lastRun ? JSON.stringify(lastRun, null, 2) : null;

  return (
    <div style={{ display: 'grid', gap: 16, padding: 20, background: 'linear-gradient(180deg, #f1f5f9, #ffffff)' }}>
      <header>
        <h1 style={{ margin: 0, color: '#0f172a' }}>Blueprint orchestration stress lab</h1>
        <p style={{ color: '#334155', marginTop: 8 }}>
          End-to-end orchestration entrypoint backed by advanced domain models, typed registry patterns, and async scheduler runs.
        </p>
      </header>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1.2fr 1fr' }}>
        <BlueprintControlPanel
          plans={plans}
          blueprints={blueprints}
          selectedPlanId={selectedPlanId}
          selectedBlueprintId={selectedBlueprintId}
          onSeed={handleSeed}
          onRefresh={handleRefresh}
          onRun={async (planId, mode) => handleRun(planId, mode)}
          onQueue={async (blueprint, mode) => {
            selectBlueprint(blueprint.blueprintId);
            await handleQueue(mode);
          }}
          onPlanSelect={selectPlan}
          onBlueprintSelect={selectBlueprint}
          running={running}
          executing={executing}
        />

        <BlueprintTimeline
          blueprint={activeBlueprint}
          onSelectStep={setSelectedStepId}
          compact={false}
        />
      </div>

      <section style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, background: '#fff' }}>
          <h3>Run context</h3>
          <p style={{ color: '#475569', marginTop: 4 }}>
            Selected plan: {selectedPlan?.labels.short}
          </p>
          <p style={{ color: '#475569', marginTop: 4 }}>
            Last run: {latestRun ? latestRun : 'No run yet'}
          </p>
          <p style={{ color: '#475569', marginTop: 4 }}>
            Active step: {selectedStepId || 'none'}
          </p>
          {catalogSnapshot ? (
            <ul style={{ margin: 0, paddingLeft: 20, color: '#0f172a' }}>
              <li>Total items: {catalogSnapshot.total}</li>
              <li>Updated: {catalogSnapshot.updatedAt}</li>
              <li>By risk bands: {Object.entries(catalogSnapshot.byRiskBand).map(([band, count]) => `${band}:${count}`).join(' · ')}</li>
            </ul>
          ) : null}
        </div>

        <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, background: '#0f172a', color: '#f8fafc' }}>
          <h3 style={{ marginTop: 0 }}>Trace log</h3>
          {[...blueprintTrace, ...allLogs].slice(0, 30).map((item, index) => (
            <div key={`${item}-${index}`} style={{ padding: '2px 0', fontFamily: 'monospace', fontSize: 12 }}>
              {item}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
