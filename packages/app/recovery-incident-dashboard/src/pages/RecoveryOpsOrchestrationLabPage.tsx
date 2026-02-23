import { useRecoveryOpsOrchestrationLab } from '../hooks/useRecoveryOpsOrchestrationLab';
import { SignalSeriesCard } from '../components/recovery-ops-orchestration-lab/SignalSeriesCard';
import { PlanSelector } from '../components/recovery-ops-orchestration-lab/PlanSelector';
import { WorkspaceTimeline } from '../components/recovery-ops-orchestration-lab/WorkspaceTimeline';
import type { OrchestrationLabPageProps } from '../types/recoveryOpsOrchestrationLab';

export function RecoveryOpsOrchestrationLabPage({ lab, onSelect, onRun }: OrchestrationLabPageProps) {
  const { workspace, loading, error, signalCount, candidateCount, timeline, selectedPlanId, selectPlan, runPlan } =
    useRecoveryOpsOrchestrationLab(lab);

  const candidates = (workspace?.envelope.plans ?? []).map((plan) => ({
    id: plan.id,
    title: plan.title,
    score: plan.score,
    confidence: plan.confidence,
  }));

  return (
    <main>
      <h1>Recovery Orchestration Lab</h1>
      {loading ? <p>loading</p> : null}
      {error ? <p style={{ color: 'red' }}>{error}</p> : null}
      <p>
        signals={signalCount} · candidates={candidateCount}
      </p>
      <SignalSeriesCard
        signals={workspace?.lab.signals ?? []}
        title={`Signals for ${lab.title}`}
      />
      <PlanSelector
        plans={candidates}
        selectedPlanId={selectedPlanId}
        onSelect={(planId) => {
          void selectPlan(planId);
          onSelect?.(planId);
        }}
      />
      <WorkspaceTimeline points={timeline} />
      <button
        type="button"
        onClick={() => {
          void runPlan().then(() => {
            onRun?.(selectedPlanId);
          });
        }}
      >
        run selected plan
      </button>
    </main>
  );
}
