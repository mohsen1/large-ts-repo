import { useMemo } from 'react';
import { type OrchestrationOutput, type IncidentIntentPlan } from '@domain/recovery-incident-intent';

interface IntentTimelineProps {
  readonly outputs: readonly OrchestrationOutput[];
}

const splitPhases = (plan: IncidentIntentPlan): readonly string[] =>
  plan.phases.map((phase) => [phase.phase, phase.finishedAt ?? phase.startedAt].join(' @ '));

const flatten = <T,>(values: readonly (readonly T[])[]): readonly T[] => values.flat();

export const IntentTimeline = ({ outputs }: IntentTimelineProps) => {
  const rows = useMemo(
    () =>
      flatten(
        outputs.map((output) => {
          const currentPlan = output.topPlan;
          const history = splitPhases(currentPlan);
          const summary = output.route.steps.map((step) => `${step.path}:${step.weight}`);
          return [...history, ...summary];
        }),
      ),
    [outputs],
  );

  return (
    <section>
      <h3>Orchestration Timeline</h3>
      <ol>
        {rows.slice(0, 20).map((row) => (
          <li key={`${row}`}>{row}</li>
        ))}
      </ol>
    </section>
  );
};
