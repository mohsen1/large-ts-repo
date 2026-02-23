import { FC, useMemo } from 'react';
import { useCockpitDirector } from '../hooks/useCockpitDirector';
import { CockpitCommandCenter } from '../components/CockpitCommandCenter';
import { ReadinessNarrativePanel } from '../components/ReadinessNarrativePanel';
import { ReadinessSignalsTable } from '../components/ReadinessSignalsTable';
import { useReadinessNarrative } from '../hooks/useReadinessNarrative';

export const RecoveryCockpitOperationsCommandPage: FC = () => {
  const director = useCockpitDirector({});
  const narratives = useReadinessNarrative(director.latestSummaries);

  const selectedPlan = director.plans.find((plan) => plan.planId === director.selectedPlanId);

  const snapshot = useMemo(() => {
    const activeSignals = Object.entries(director.latestSummaries).map(([planId, summary]) => ({
      planId,
      markerCount: director.readyLines.find((line) => line.planId === planId)?.markerCount ?? 0,
      score: summary.latestReadiness,
    }));
    return activeSignals.sort((left, right) => right.score - left.score);
  }, [director.latestSummaries, director.readyLines]);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 16, display: 'grid', gap: 12 }}>
      <header>
        <h1>Operations Command</h1>
        <p>Runbook and command orchestration cockpit with event snapshots.</p>
        <button type="button" onClick={() => void director.bootstrap()}>
          Bootstrap sample plans
        </button>
      </header>
      <CockpitCommandCenter
        plans={director.plans}
        selectedPlanId={director.selectedPlanId}
        events={director.events}
        onSelectPlan={director.selectPlan}
        onRunPlan={director.execute}
        onReroutePlan={director.reroute}
      />
      <ReadinessNarrativePanel narratives={narratives} selectedPlanId={director.selectedPlanId} />
      <ReadinessSignalsTable events={director.events} lines={director.readyLines} />
      <section style={{ border: '1px solid #ddd', padding: 12, borderRadius: 8 }}>
        <h3>Active plan</h3>
        <p>{selectedPlan ? `${selectedPlan.labels.short} ${selectedPlan.labels.emoji}` : 'No plan selected'}</p>
        <p>Ready: {director.ready ? 'yes' : 'no'}</p>
        <p>Bootstrap: {director.bootstrapReady ? 'initialized' : 'pending'}</p>
        <p>Last run state: {director.planReady ? 'present' : 'unknown'}</p>
        <ul>
          {snapshot.map((entry) => (
            <li key={entry.planId}>
              {entry.planId} readiness={entry.score.toFixed(2)} markers={entry.markerCount}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
};
