import { useMemo } from 'react';
import type { SimulationPlanManifest } from '@domain/recovery-simulation-core';

export interface SimulationPlanCardProps {
  readonly plan: SimulationPlanManifest;
  readonly selected: boolean;
  readonly onSelect: (planId: string) => void;
  readonly onRun: (planId: string) => void;
}

export const SimulationPlanCard = ({
  plan,
  selected,
  onSelect,
  onRun,
}: SimulationPlanCardProps) => {
  const summary = useMemo(() => {
    const criticalSteps = plan.steps.filter((step) => step.recoveryCriticality >= 4).length;
    return `${plan.steps.length} steps • ${criticalSteps} critical`;
  }, [plan.steps]);

  const className = selected ? 'simulation-plan-card is-selected' : 'simulation-plan-card';

  return (
    <article className={className}>
      <header>
        <h3>{plan.objective}</h3>
      </header>
      <p>{summary}</p>
      <p>Concurrency limit: {plan.concurrencyLimit}</p>
      <p>Budget: {Math.round(plan.expectedRecoveryBudgetMs / 1000)}s</p>
      <div className="simulation-plan-card__actions">
        <button onClick={() => onSelect(plan.id)}>Select</button>
        <button type="button" onClick={() => onRun(plan.id)}>Run</button>
      </div>
    </article>
  );
};
