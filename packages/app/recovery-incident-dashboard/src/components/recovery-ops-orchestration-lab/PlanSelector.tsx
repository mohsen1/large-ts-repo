import type { OrchestrationLabTimelinePoint } from '../../types/recoveryOpsOrchestrationLab';
import type { LabPlan } from '@domain/recovery-ops-orchestration-lab';

interface PlanCandidate {
  readonly id: LabPlan['id'];
  readonly title: string;
  readonly score: number;
  readonly confidence: number;
}

interface PlanSelectorProps {
  readonly plans: readonly PlanCandidate[];
  readonly selectedPlanId?: LabPlan['id'];
  readonly onSelect: (planId: LabPlan['id']) => void;
}

export const PlanSelector = ({ plans, selectedPlanId, onSelect }: PlanSelectorProps) => {
  if (plans.length === 0) {
    return <p>No candidate plans available.</p>;
  }

  return (
    <section>
      <h3>Plan candidates</h3>
      {plans.map((plan) => {
        const active = plan.id === selectedPlanId;
        return (
          <article key={plan.id} style={{ marginBottom: '8px' }}>
            <div>
              <strong>{plan.title}</strong>
            </div>
            <div>
              score {plan.score.toFixed(2)} · confidence {plan.confidence.toFixed(2)}
            </div>
            <button type="button" onClick={() => onSelect(plan.id)}>
              {active ? 'selected' : 'select'}
            </button>
          </article>
        );
      })}
    </section>
  );
};
