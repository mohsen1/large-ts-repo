import { useMemo } from 'react';
import type { RecoveryPlan } from '@domain/recovery-scenario-orchestration';

export interface ScenarioBlueprintCardProps {
  readonly plan: RecoveryPlan;
  readonly selected: boolean;
  readonly onSelect: (planId: RecoveryPlan['id']) => void;
}

const formatDate = (value: string): string => new Date(value).toLocaleString();

const styleForState = (state: RecoveryPlan['state']): 'ok' | 'warn' | 'alert' => {
  if (state === 'resolved') {
    return 'ok';
  }
  if (state === 'running' || state === 'planned') {
    return 'warn';
  }
  return 'alert';
};

const classifyConfidence = (score: number): string =>
  score >= 0.8 ? 'High confidence' : score >= 0.6 ? 'Manual approval needed' : 'Collect more evidence';

export const ScenarioBlueprintCard = ({ plan, selected, onSelect }: ScenarioBlueprintCardProps) => {
  const tags = useMemo(() => {
    const planTags = plan.tags ?? [];
    return [...plan.actions.flatMap((action) => action.tags), ...planTags];
  }, [plan.actions, plan.tags]);

  const stateClass = styleForState(plan.state);
  const confidence = Math.round((plan.confidence ?? 0) * 100);
  const lastUpdated = formatDate(plan.updatedAt);

  return (
    <article className={`scenario-plan scenario-plan--${stateClass}${selected ? ' is-selected' : ''}`}>
      <header>
        <h3>{plan.id}</h3>
        <p>{plan.runbookVersion}</p>
      </header>

      <section>
        <div>
          <strong>State</strong> {plan.state}
        </div>
        <div>
          <strong>Confidence</strong> {confidence}%
        </div>
        <div>
          <strong>Actions</strong> {plan.actions.length}
        </div>
      </section>

      <section>
        <p>{classifyConfidence(plan.confidence ?? 0)}</p>
      </section>

      <section>
        <div>
          <strong>Blueprint</strong> {plan.blueprintId}
        </div>
        <div>
          <strong>Last update</strong> {lastUpdated}
        </div>
      </section>

      <section>
        {tags.slice(0, 8).map((tag) => (
          <span className="scenario-tag" key={tag}>
            {tag}
          </span>
        ))}
      </section>

      <footer>
        <button onClick={() => onSelect(plan.id)}>Open</button>
      </footer>
    </article>
  );
};
