import { useMemo, useState } from 'react';
import { SituationalReadinessPanel } from '../components/SituationalReadinessPanel';
import { RecoveryReadinessHeatmap } from '../components/RecoveryReadinessHeatmap';
import { SituationalTimeline } from '../components/SituationalTimeline';
import { useSituationalCommandCenter } from '../hooks/useSituationalCommandCenter';
import type { OrchestrateRequest } from '@service/recovery-situational-orchestrator';

export const SituationalOrchestrationPage = ({
  initialPlan,
}: {
  readonly initialPlan?: OrchestrateRequest[];
}) => {
  const {
    assessments,
    plans,
    pulses,
    loading,
    error,
    runBatch,
    resolveAssessment,
  } = useSituationalCommandCenter();

  const [selected, setSelected] = useState<string>('');

  const planChoices = useMemo(() => plans.map((plan) => plan.planId), [plans]);

  const onBulkRun = () => {
    if (!initialPlan || initialPlan.length === 0) {
      return;
    }
    void runBatch(initialPlan);
  };

  return (
    <main className="situational-orchestration-page">
      <header>
        <h1>Situational Orchestration</h1>
        <p>Cross-layer planning and recovery command simulation.</p>
        <button onClick={onBulkRun} disabled={loading || !initialPlan?.length} type="button">
          Run Batch
        </button>
        {error ? <p>{error}</p> : null}
      </header>

      <section>
        <h2>Pulse Summary</h2>
        <ul>
          {pulses.map((pulse) => (
            <li key={`${pulse.label}-${pulse.value}`}> {pulse.label}: {pulse.value.toFixed(3)} ({pulse.trend})</li>
          ))}
        </ul>
      </section>

      <section>
        <SituationalReadinessPanel
          assessments={assessments}
          plans={plans}
          selectedPlanId={selected}
          onSelect={(planId) => {
            setSelected(planId);
            const match = assessments.find((assessment) => assessment.plan.planId === planId);
            if (match) {
              void resolveAssessment(match.assessmentId);
            }
          }}
        />
      </section>

      <section>
        <RecoveryReadinessHeatmap
          assessments={assessments}
          onCellSelect={(assessmentId) => setSelected(assessmentId)}
        />
      </section>

      <section>
        <SituationalTimeline assessments={assessments} />
      </section>

      <section>
        <h2>Available Plans</h2>
        <div className="plan-chips">
          {planChoices.map((planId) => (
            <button
              key={planId}
              onClick={() => {
                setSelected(planId);
              }}
              type="button"
              aria-pressed={selected === planId}
            >
              {planId}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
};
