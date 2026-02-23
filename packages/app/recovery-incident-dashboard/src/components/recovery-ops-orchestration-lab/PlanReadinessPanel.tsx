import type { OrchestrationLab, LabPlan } from '@domain/recovery-ops-orchestration-lab';
import { optimizePlanSelection, explainSelection } from '@domain/recovery-ops-orchestration-lab';
import type { OrchestrationPolicy } from '@domain/recovery-ops-orchestration-lab';

interface PlanReadinessPanelProps {
  readonly lab: OrchestrationLab;
  readonly policy: OrchestrationPolicy;
  readonly onSelect: (plan: LabPlan['id']) => void;
}

export const PlanReadinessPanel = ({ lab, policy, onSelect }: PlanReadinessPanelProps) => {
  const constraints = {
    maxSteps: Math.max(1, policy.maxParallelSteps),
    includeAutomatedOnly: false,
    minReversibleRatio: 0.25,
  };
  const optimization = optimizePlanSelection(lab, policy, constraints);

  if (optimization.ranked.length === 0) {
    return (
      <section>
        <h3>Plan readiness</h3>
        <p>No plan meets current optimization constraints.</p>
      </section>
    );
  }

  return (
    <section>
      <h3>Plan readiness</h3>
      <p>{explainSelection(optimization)}</p>
      <ul>
        {optimization.ranked.slice(0, 5).map((candidate) => (
          <li key={`${candidate.candidate.id}:${candidate.index}`}>
            <div>
              <strong>{candidate.candidate.title}</strong>
            </div>
            <div>{`score: ${candidate.score.toFixed(2)} confidence: ${candidate.candidate.confidence.toFixed(2)}`}</div>
            <div>{`steps: ${candidate.candidate.steps.length}`}</div>
          <button type="button" onClick={() => onSelect(candidate.candidate.id)}>
            use
          </button>
          </li>
        ))}
      </ul>
      <ul>
        {optimization.rejected.slice(0, 3).map((entry) => (
          <li key={entry.planId}>{`${entry.planId}: ${entry.reason}`}</li>
        ))}
      </ul>
    </section>
  );
};
