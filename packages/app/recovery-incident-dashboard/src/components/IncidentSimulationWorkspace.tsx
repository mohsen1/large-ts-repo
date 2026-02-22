import { useMemo } from 'react';
import type { RecoveryPlanCandidate } from '@domain/recovery-situational-intelligence';

const formatPlan = (plan: RecoveryPlanCandidate) => {
  const summary = [
    `nodes: ${plan.sourceSignalIds.length}`,
    `commands: ${plan.hypotheses[0]?.commands.length ?? 0}`,
    `confidence=${Math.round(plan.confidence * 100)}%`,
  ];
  return `${plan.title} • ${summary.join(' · ')}`;
};

export const IncidentSimulationWorkspace = ({
  plans,
  onRun,
}: {
  readonly plans: readonly RecoveryPlanCandidate[];
  readonly onRun: (planId: string) => Promise<unknown>;
}) => {
  const sorted = useMemo(() => [...plans].sort((left, right) => right.confidence - left.confidence), [plans]);

  return (
    <section className="incident-simulation-workspace">
      <h2>Simulation Workspace</h2>
      <ol>
        {sorted.map((plan) => (
          <li key={plan.planId}>
            <p>{formatPlan(plan)}</p>
            <p>{plan.description}</p>
            <ul>
              {plan.hypotheses.map((hypothesis) => (
                <li key={hypothesis.hypothesisId}>
                  <strong>{hypothesis.label}</strong> · {hypothesis.likelyImpactPercent}%
                </li>
              ))}
            </ul>
            <button
              onClick={() => {
                void onRun(plan.planId);
              }}
              type="button"
            >
              Re-execute Plan
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
};
